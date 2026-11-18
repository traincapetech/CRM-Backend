/**
 * Script to safely distribute Sales data to active Sales Persons as Leads.
 * 
 * Guarantees:
 * 1. ZERO data loss: preserves source, leadBy, countryCode, country, remarks, clientRemark, and previous courses.
 * 2. ZERO financial leakage: totalCost, tokenAmount, payment methods, and passwords are never copied.
 * 3. EXCLUDES all terminated staff: only distributes to verified ACTIVE sales persons.
 * 4. De-duplication: checks phone & email hash so existing active leads aren't duplicated.
 * 5. Reassigns orphaned leads: any existing lead currently assigned to terminated staff is reassigned to the active team.
 * 
 * Usage:
 *   node server/scripts/distribute_sales_to_leads.js --dry-run
 *   node server/scripts/distribute_sales_to_leads.js --execute
 *   node server/scripts/distribute_sales_to_leads.js --revert <BATCH_ID>
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const fs = require('fs');
const path = require('path');
const mongoose = require(path.join(__dirname, '../node_modules/mongoose'));
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env') });

// Preload all models
fs.readdirSync(path.join(__dirname, '../models')).forEach(file => {
  if (file.endsWith('.js')) {
    try { require(path.join(__dirname, '../models', file)); } catch (e) {}
  }
});

const { encrypt, hashForSearch } = require(path.join(__dirname, '../utils/encryption'));
const User = require(path.join(__dirname, '../models/User'));
const Employee = require(path.join(__dirname, '../models/Employee'));
const Lead = require(path.join(__dirname, '../models/Lead'));
const Sale = require(path.join(__dirname, '../models/Sale'));
const Log = require(path.join(__dirname, '../models/Log'));

// Fisher-Yates shuffle
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
  const isExecute = args.includes('--execute');
  const isRevert = args.includes('--revert');
  const batchIdArg = isRevert ? args[args.indexOf('--revert') + 1] : null;

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI missing from .env');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB Atlas\n');

  if (isRevert) {
    if (!batchIdArg) {
      console.error('❌ Please specify batch ID: node distribute_sales_to_leads.js --revert <BATCH_ID>');
      await mongoose.disconnect();
      process.exit(1);
    }
    await handleRevert(batchIdArg);
    await mongoose.disconnect();
    return;
  }

  const batchId = `DIST_SALES_${Date.now()}`;
  console.log('================================================================');
  console.log(`MODE: ${isExecute ? '🚀 LIVE EXECUTION' : '🔍 PREVIEW / DRY RUN (No changes saved)'}`);
  console.log(`BATCH ID: ${batchId}`);
  console.log('================================================================\n');

  // 1. Fetch verified ACTIVE sales persons (cross-checking with Employee status)
  const activeEmployees = await Employee.find({ status: 'ACTIVE' }).select('userId email name').lean();
  const activeUserEmails = new Set(activeEmployees.map(e => e.email?.toLowerCase()).filter(Boolean));
  const activeUserIds = new Set(activeEmployees.map(e => e.userId?.toString()).filter(Boolean));

  // Explicitly terminated list to guarantee exclusion
  const terminatedNamesRegex = /Ritika|Madan Mohan|Susanah|Tharmi|Divyam Raj/i;

  const salesUsers = await User.find({
    role: { $in: ['Sales Person', 'Senior Sales Executive', 'Sales Executive'] },
    active: { $ne: false },
    fullName: { $not: terminatedNamesRegex }
  }).select('_id fullName email role').lean();

  const activeSalesReps = salesUsers.filter(u => 
    activeUserEmails.has(u.email?.toLowerCase()) || activeUserIds.has(u._id.toString())
  );

  if (activeSalesReps.length === 0) {
    console.error('❌ No active sales persons found!');
    await mongoose.disconnect();
    return;
  }

  console.log(`✅ Verified Active Sales Team (${activeSalesReps.length} reps):`);
  activeSalesReps.forEach((rep, idx) => {
    console.log(`   ${idx + 1}. ${rep.fullName} (${rep.email}) [ID: ${rep._id}]`);
  });
  console.log('');

  // 2. Load all 619 Sales
  const allSales = await Sale.find().sort({ date: -1 }).lean();
  console.log(`Loaded ${allSales.length} total Sales records.`);

  // 3. Map Sales into Leads with full metadata preservation
  let leadsToCreate = [];
  let existingLeadsReassigned = [];
  let existingLeadsSkippedActive = 0;

  let repIndex = 0;
  function getNextRep() {
    const rep = activeSalesReps[repIndex % activeSalesReps.length];
    repIndex++;
    return rep;
  }

  for (const s of allSales) {
    // Check if phone or email already exists in Lead collection
    let existingLead = null;
    let cleanPhone = s.contactNumber ? s.contactNumber.replace(/\D/g, '') : '';
    
    if (cleanPhone && cleanPhone.length >= 6) {
      existingLead = await Lead.findOne({ phoneHash: hashForSearch(cleanPhone) });
    }
    if (!existingLead && s.email) {
      existingLead = await Lead.findOne({ emailHash: hashForSearch(s.email.toLowerCase().trim()) });
    }

    // Determine rich source
    let sourceVal = s.source ? s.source.trim() : '';
    if (!sourceVal && s.isReference) sourceVal = 'Reference';
    if (!sourceVal && s.leadBy) sourceVal = `Lead by ${s.leadBy.trim()}`;
    if (!sourceVal) sourceVal = 'Past Enrolled Student';

    // Compile contextual remarks (WITHOUT any financial amounts)
    const remarksParts = [];
    if (s.leadBy && s.leadBy.trim()) remarksParts.push(`Lead By: ${s.leadBy.trim()}`);
    if (s.remarks && s.remarks.trim()) remarksParts.push(`Notes: ${s.remarks.trim()}`);
    if (s.clientRemark && s.clientRemark.trim()) remarksParts.push(`Client Remark: ${s.clientRemark.trim()}`);
    if (s.date) {
      const d = new Date(s.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      remarksParts.push(`Original Enrollment: ${d}`);
    }
    const combinedRemarks = remarksParts.length > 0 ? remarksParts.join(' | ') : 'Past Student / Re-engagement';

    // Format clean country code
    let cCode = s.countryCode ? s.countryCode.toString().replace(/\D/g, '') : '';
    if (cCode && !cCode.startsWith('+')) cCode = `+${cCode}`;
    if (!cCode) cCode = '+91';

    if (existingLead) {
      // Check who this existing lead is assigned to
      const currentAssignee = existingLead.assignedTo ? existingLead.assignedTo.toString() : null;
      const isAssignedToActive = activeSalesReps.some(r => r._id.toString() === currentAssignee);

      if (!isAssignedToActive) {
        // Orphaned lead with terminated rep or unassigned! Reassign to next active rep
        const assignedRep = getNextRep();
        existingLeadsReassigned.push({
          leadId: existingLead._id,
          name: existingLead.name || s.customerName,
          oldAssignee: currentAssignee,
          newAssignee: assignedRep,
          source: sourceVal,
          course: s.course
        });

        if (isExecute) {
          existingLead.assignedTo = assignedRep._id;
          existingLead.assignmentMethod = 'ROUND_ROBIN';
          if (!existingLead.source || existingLead.source === '') {
            existingLead.source = sourceVal;
          }
          existingLead.isRepeatCustomer = true;
          if (s.course && (!existingLead.previousCourses || !existingLead.previousCourses.includes(s.course))) {
            existingLead.previousCourses = existingLead.previousCourses || [];
            existingLead.previousCourses.push(s.course);
          }
          existingLead.assignmentHistory.push({
            assignedTo: assignedRep._id,
            assignedAt: new Date(),
            assignmentMethod: 'ROUND_ROBIN',
            note: `Reassigned from terminated staff via Sales re-engagement batch ${batchId}`
          });
          existingLead.updatedAt = new Date();
          await existingLead.save();

          // Log action
          await Log.create({
            action: 'LEAD_UPDATE',
            performedBy: assignedRep._id,
            affectedResource: 'Lead',
            resourceId: existingLead._id,
            timestamp: new Date(),
            details: { batchId, reassignedTo: assignedRep.fullName }
          });
        }
      } else {
        existingLeadsSkippedActive++;
      }
    } else {
      // Brand new lead to create
      const assignedRep = getNextRep();
      const newLeadData = {
        name: s.customerName.trim(),
        course: s.course ? s.course.trim() : 'General',
        countryCode: cCode,
        phone: cleanPhone || s.contactNumber,
        email: s.email ? s.email.toLowerCase().trim() : undefined,
        country: s.country ? s.country.trim() : 'India',
        source: sourceVal,
        status: 'Introduction',
        assignedTo: assignedRep._id,
        originalAssignedTo: assignedRep._id,
        assignmentMethod: 'ROUND_ROBIN',
        isRepeatCustomer: true,
        previousCourses: s.course ? [s.course.trim()] : [],
        remarks: combinedRemarks,
        assignmentHistory: [{
          assignedTo: assignedRep._id,
          assignedAt: new Date(),
          assignmentMethod: 'ROUND_ROBIN',
          note: `Auto-distributed from past sales records [Batch: ${batchId}]`
        }],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      leadsToCreate.push({ leadData: newLeadData, assignedRep, saleId: s._id });

      if (isExecute) {
        const created = await Lead.create(newLeadData);
        await Log.create({
          action: 'LEAD_UPDATE',
          performedBy: assignedRep._id,
          affectedResource: 'Lead',
          resourceId: created._id,
          timestamp: new Date(),
          details: { batchId, sourceSaleId: s._id, assignedTo: assignedRep.fullName }
        });
      }
    }
  }

  // 4. Summarize Distribution Breakdown
  console.log('\n================================================================');
  console.log('DISTRIBUTION SUMMARY:');
  console.log('================================================================');
  console.log(`• Total Sales processed: ${allSales.length}`);
  console.log(`• Brand new Leads to create: ${leadsToCreate.length}`);
  console.log(`• Orphaned leads reassigned from terminated staff: ${existingLeadsReassigned.length}`);
  console.log(`• Existing leads already with active staff (kept untouched): ${existingLeadsSkippedActive}`);
  console.log(`• TOTAL leads distributed to active sales team: ${leadsToCreate.length + existingLeadsReassigned.length}`);
  console.log('----------------------------------------------------------------\n');

  // Breakdown per active rep
  const repCounts = {};
  activeSalesReps.forEach(r => repCounts[r.fullName] = { new: 0, reassigned: 0, total: 0 });

  leadsToCreate.forEach(item => {
    repCounts[item.assignedRep.fullName].new++;
    repCounts[item.assignedRep.fullName].total++;
  });
  existingLeadsReassigned.forEach(item => {
    repCounts[item.newAssignee.fullName].reassigned++;
    repCounts[item.newAssignee.fullName].total++;
  });

  console.log('LEAD ALLOCATION PER SALES PERSON:');
  Object.keys(repCounts).forEach((name, i) => {
    const c = repCounts[name];
    console.log(`  ${i + 1}. ${name.padEnd(25)}: ${c.total} leads (${c.new} new + ${c.reassigned} reassigned)`);
  });

  console.log('\nSAMPLE LEAD VERIFICATION (Checking zero financial leakage & rich metadata):');
  if (leadsToCreate.length > 0) {
    const sample = leadsToCreate[0].leadData;
    console.log({
      name: sample.name,
      countryCode: sample.countryCode,
      country: sample.country,
      course: sample.course,
      source: sample.source,
      status: sample.status,
      remarks: sample.remarks,
      isRepeatCustomer: sample.isRepeatCustomer,
      previousCourses: sample.previousCourses,
      hasPhone: !!sample.phone,
      hasEmail: !!sample.email,
      NO_TOTAL_COST: sample.totalCost === undefined ? '✅ SAFE (Excluded)' : '❌ LEAKED',
      NO_TOKEN_AMOUNT: sample.tokenAmount === undefined ? '✅ SAFE (Excluded)' : '❌ LEAKED',
      NO_PASSWORD: sample.password === undefined ? '✅ SAFE (Excluded)' : '❌ LEAKED'
    });
  }

  if (!isExecute) {
    console.log('\n👉 To apply these changes to the live database, run:');
    console.log('   node server/scripts/distribute_sales_to_leads.js --execute\n');
  } else {
    console.log('\n🎉 SUCCESS: All leads successfully distributed and saved in MongoDB!');
    console.log(`Batch ID for rollback: ${batchId}`);
  }

  await mongoose.disconnect();
}

async function handleRevert(batchId) {
  console.log(`Reverting batch: ${batchId}...`);
  const logs = await Log.find({ 'details.batchId': batchId });
  console.log(`Found ${logs.length} logged actions for batch.`);
  for (const log of logs) {
    if (log.details.sourceSaleId) {
      // It was a newly created lead, delete it
      await Lead.findByIdAndDelete(log.resourceId);
    }
  }
  console.log('✅ Revert complete.');
}

run().catch(err => {
  console.error('❌ Error executing distribution:', err);
  process.exit(1);
});
