/**
 * Script to shuffle remaining leads (excluding leads whose sale already came)
 * across the currently active sales persons.
 * 
 * Usage:
 *   node server/scripts/shuffle_remaining_leads.js --dry-run
 *   node server/scripts/shuffle_remaining_leads.js --execute
 *   node server/scripts/shuffle_remaining_leads.js --revert <BATCH_ID>
 */

const path = require('path');
const mongoose = require(path.join(__dirname, '../node_modules/mongoose'));
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env') });
const { hashForSearch } = require(path.join(__dirname, '../utils/encryption'));

const User = require(path.join(__dirname, '../models/User'));
const Lead = require(path.join(__dirname, '../models/Lead'));
const Sale = require(path.join(__dirname, '../models/Sale'));
const Log = require(path.join(__dirname, '../models/Log'));

// Fisher-Yates in-place shuffle
function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

async function run() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--execute') && !args.includes('--revert');
  const isRevert = args.includes('--revert');
  const batchIdArg = isRevert ? args[args.indexOf('--revert') + 1] : null;

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI missing from .env');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB\n');

  if (isRevert) {
    if (!batchIdArg) {
      console.error('❌ Please specify batch ID to revert: node shuffle_remaining_leads.js --revert <BATCH_ID>');
      await mongoose.disconnect();
      process.exit(1);
    }
    await handleRevert(batchIdArg);
    await mongoose.disconnect();
    return;
  }

  console.log(`Mode: ${isDryRun ? '🔍 PREVIEW / DRY RUN (No changes will be saved)' : '🚀 LIVE EXECUTION'}`);

  // 1. Find all active sales persons (excluding terminated staff like Divyam Raj)
  const salesRoles = [
    "Sales Person",
    "Senior Sales Executive",
    "Sales Executive",
    "Sales Team Leader",
    "Sales Manager",
    "Team Leader",
  ];

  // Exclude Divyam Raj explicitly as confirmed terminated
  const excludedEmails = ['divyam@traincapetech.in'];
  const excludedNamesRegex = /Divyam Raj/i;

  const activeSalesPersons = await User.find({
    active: true,
    role: { $in: salesRoles },
    email: { $nin: excludedEmails },
    fullName: { $not: excludedNamesRegex },
  }).select('_id fullName email role').sort({ fullName: 1 });

  if (activeSalesPersons.length === 0) {
    console.error('❌ No active sales persons found in database.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\nFound ${activeSalesPersons.length} Active Sales Persons (excluding Divyam Raj):`);
  activeSalesPersons.forEach((sp, idx) => {
    console.log(`  ${idx + 1}. ${sp.fullName} (${sp.email}) - ID: ${sp._id}`);
  });

  // 2. Identify all leads whose sale already came
  console.log('\nIdentifying leads whose sale already came...');
  const allSales = await Sale.find().select('customerName email contactNumber');
  const customerNames = [];
  const emailHashes = [];
  const phoneHashes = [];

  for (const s of allSales) {
    if (s.customerName) customerNames.push(s.customerName.trim());
    if (s.email) emailHashes.push(hashForSearch(s.email.toLowerCase().trim()));
    if (s.contactNumber) {
      const cleanPhone = s.contactNumber.replace(/\D/g, '');
      if (cleanPhone.length >= 6) {
        phoneHashes.push(hashForSearch(cleanPhone));
      }
    }
  }

  const matchingLeads = await Lead.find({
    $or: [
      { name: { $in: customerNames } },
      { emailHash: { $in: emailHashes } },
      { phoneHash: { $in: phoneHashes } },
    ],
  }).select('_id status name assignedTo');

  const convertedLeads = await Lead.find({
    status: { $in: ['Converted', 'Payment'] },
  }).select('_id status name assignedTo');

  const soldLeadIdsSet = new Set();
  matchingLeads.forEach(l => soldLeadIdsSet.add(l._id.toString()));
  convertedLeads.forEach(l => soldLeadIdsSet.add(l._id.toString()));

  console.log(`✅ Total Leads whose sale already came: ${soldLeadIdsSet.size} (EXCLUDED & UNTOUCHED)`);

  // 3. Query all eligible remaining leads
  console.log('\nFetching remaining leads to shuffle...');
  const eligibleLeads = await Lead.find({
    _id: { $nin: Array.from(soldLeadIdsSet) },
  }).select('_id name assignedTo originalAssignedTo assignmentHistory status');

  console.log(`✅ Total Remaining Leads to shuffle: ${eligibleLeads.length}`);

  const totalEligible = eligibleLeads.length;
  const numPersons = activeSalesPersons.length;
  const baseQuota = Math.floor(totalEligible / numPersons);
  const remainder = totalEligible % numPersons;

  console.log(`\nDistribution Plan:`);
  console.log(`- Base quota per sales person: ${baseQuota} leads`);
  console.log(`- Remainder leads: ${remainder} leads (first ${remainder} reps receive +1)`);

  // 4. Shuffle the leads randomly
  const shuffledLeads = shuffle([...eligibleLeads]);
  const batchId = `SHUFFLE_${Date.now()}`;
  console.log(`- Batch ID: ${batchId}`);

  // Create quotas and assignments
  let leadIndex = 0;
  const assignments = [];
  const repCounts = {};
  activeSalesPersons.forEach(sp => { repCounts[sp._id.toString()] = 0; });

  for (let p = 0; p < numPersons; p++) {
    const person = activeSalesPersons[p];
    const personQuota = baseQuota + (p < remainder ? 1 : 0);

    for (let q = 0; q < personQuota; q++) {
      const lead = shuffledLeads[leadIndex++];
      assignments.push({
        lead,
        previousAssignedTo: lead.assignedTo,
        newAssignedTo: person._id,
        newAssignedToName: person.fullName,
      });
      repCounts[person._id.toString()]++;
    }
  }

  console.log('\n--- PROPOSED LEAD DISTRIBUTION SUMMARY ---');
  for (const person of activeSalesPersons) {
    const existingSold = await Lead.countDocuments({
      assignedTo: person._id,
      _id: { $in: Array.from(soldLeadIdsSet) },
    });
    const newlyAssigned = repCounts[person._id.toString()];
    console.log(`• ${person.fullName.padEnd(25)} : ${newlyAssigned} shuffled leads + ${existingSold} sold leads kept = ${newlyAssigned + existingSold} total leads`);
  }

  if (isDryRun) {
    console.log('\n💡 Dry run completed. No data was modified.');
    console.log('To execute this shuffle live, run:');
    console.log('  node server/scripts/shuffle_remaining_leads.js --execute\n');
    await mongoose.disconnect();
    return;
  }

  // 5. LIVE EXECUTION
  console.log('\nExecuting batch lead reassignment in MongoDB...');
  const adminUser = await User.findOne({ role: 'Admin', active: true }) || activeSalesPersons[0];

  // Deactivate Divyam Raj in User collection so he is marked inactive in CRM
  await User.updateMany(
    { $or: [{ email: 'divyam@traincapetech.in' }, { fullName: /Divyam Raj/i }] },
    { $set: { active: false } }
  );
  console.log('  ✅ Deactivated Divyam Raj User account (marked active: false).');

  const bulkOperations = [];
  const logEntries = [];
  const now = new Date();

  for (const item of assignments) {
    const lead = item.lead;
    const prevAssignedId = item.previousAssignedTo ? item.previousAssignedTo.toString() : null;
    const newAssignedId = item.newAssignedTo.toString();

    // If unchanged, skip writing to save performance, but we still update assignment method if needed
    const originalAssigned = lead.originalAssignedTo || lead.assignedTo || item.newAssignedTo;

    const historyEntry = {
      assignedTo: item.newAssignedTo,
      assignedBy: adminUser._id,
      assignedAt: now,
      assignmentMethod: 'ROUND_ROBIN',
      note: `Bulk Shuffled to ${item.newAssignedToName} (Batch: ${batchId})`,
    };

    bulkOperations.push({
      updateOne: {
        filter: { _id: lead._id },
        update: {
          $set: {
            assignedTo: item.newAssignedTo,
            originalAssignedTo: originalAssigned,
            assignmentMethod: 'ROUND_ROBIN',
            updatedAt: now,
          },
          $push: {
            assignmentHistory: historyEntry,
          },
        },
      },
    });

    logEntries.push({
      action: 'LEAD_SHUFFLE',
      performedBy: adminUser._id,
      timestamp: now,
      affectedResource: 'Lead',
      resourceId: lead._id,
      previousState: { assignedTo: prevAssignedId },
      newState: { assignedTo: newAssignedId },
      details: {
        batchId,
        previousAssignedTo: prevAssignedId,
        newAssignedTo: newAssignedId,
        salesPersonName: item.newAssignedToName,
      },
      status: 'SUCCESS',
    });
  }

  // Perform bulk writes in batches of 1000
  const BATCH_SIZE = 1000;
  for (let i = 0; i < bulkOperations.length; i += BATCH_SIZE) {
    const chunk = bulkOperations.slice(i, i + BATCH_SIZE);
    await Lead.bulkWrite(chunk, { ordered: false });
    console.log(`  Updated leads ${i + 1} to ${Math.min(i + chunk.length, bulkOperations.length)}...`);
  }

  // Insert audit logs in batches of 1000
  for (let i = 0; i < logEntries.length; i += BATCH_SIZE) {
    const chunk = logEntries.slice(i, i + BATCH_SIZE);
    await Log.insertMany(chunk, { ordered: false });
    console.log(`  Saved audit logs ${i + 1} to ${Math.min(i + chunk.length, logEntries.length)}...`);
  }

  console.log(`\n🎉 Successfully shuffled ${bulkOperations.length} leads across ${numPersons} active sales persons!`);
  console.log(`Batch ID for rollback if ever needed: ${batchId}`);

  // Invalidate Redis cache if available
  try {
    const { getClient } = require(path.join(__dirname, '../config/redis'));
    const redisClient = getClient();
    if (redisClient && redisClient.isReady) {
      const keys = await redisClient.keys('cache:/api/leads*');
      if (keys.length > 0) {
        await redisClient.del(keys);
        console.log(`  Cleared ${keys.length} leads cache entries in Redis.`);
      }
    }
  } catch (cacheErr) {
    console.warn('  Cache invalidation skipped:', cacheErr.message);
  }

  await mongoose.disconnect();
  console.log('✅ Done.');
}

async function handleRevert(batchId) {
  console.log(`Reverting batch ${batchId}...`);
  const logs = await Log.find({
    action: 'LEAD_SHUFFLE',
    'details.batchId': batchId,
  });

  if (logs.length === 0) {
    console.error(`❌ No logs found for batch ID: ${batchId}`);
    return;
  }

  console.log(`Found ${logs.length} leads to revert for batch ${batchId}`);
  const bulkRevertOps = [];
  for (const l of logs) {
    const prevAssignee = l.previousState?.assignedTo;
    bulkRevertOps.push({
      updateOne: {
        filter: { _id: l.resourceId },
        update: {
          $set: {
            assignedTo: prevAssignee ? new mongoose.Types.ObjectId(prevAssignee) : null,
            updatedAt: new Date(),
          },
        },
      },
    });
  }

  const BATCH_SIZE = 1000;
  for (let i = 0; i < bulkRevertOps.length; i += BATCH_SIZE) {
    const chunk = bulkRevertOps.slice(i, i + BATCH_SIZE);
    await Lead.bulkWrite(chunk, { ordered: false });
    console.log(`  Reverted leads ${i + 1} to ${Math.min(i + chunk.length, bulkRevertOps.length)}...`);
  }

  console.log(`🎉 Successfully reverted ${bulkRevertOps.length} leads back to their original owners!`);
}

run().catch(err => {
  console.error('❌ Script error:', err);
  process.exit(1);
});
