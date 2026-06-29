const mongoose = require('/Users/a/Desktop/Traincape_CRM-main/server/node_modules/mongoose');
require('/Users/a/Desktop/Traincape_CRM-main/server/node_modules/dotenv').config({ path: '/Users/a/Desktop/Traincape_CRM-main/server/.env' });

const User = require('/Users/a/Desktop/Traincape_CRM-main/server/models/User');
const Log = require('/Users/a/Desktop/Traincape_CRM-main/server/models/Log');
const Lead = require('/Users/a/Desktop/Traincape_CRM-main/server/models/Lead');

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI is missing from env.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  await mongoose.connect(mongoUri);
  console.log('Connected.');

  // Find target user
  const targetUser = await User.findOne({
    $or: [
      { fullName: { $regex: 'Ramphawung Makang', $options: 'i' } },
      { email: { $regex: 'Ramphawung Makang', $options: 'i' } }
    ]
  });

  if (!targetUser) {
    console.error('❌ User "Ramphawung Makang" not found.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Found target user: ${targetUser.fullName} (ID: ${targetUser._id})`);

  // Target logs from the batch assignment around 06:36
  const startOfBatch = new Date('2026-06-26T06:36:00.000Z');
  const endOfBatch = new Date('2026-06-26T06:37:30.000Z');

  console.log(`Querying batch logs between ${startOfBatch.toISOString()} and ${endOfBatch.toISOString()}...`);
  const logs = await Log.find({
    action: 'LEAD_UPDATE',
    affectedResource: 'Lead',
    timestamp: { $gte: startOfBatch, $lte: endOfBatch },
    $or: [
      { 'newState.assignedTo': targetUser._id },
      { 'details.assignedTo.new': targetUser._id.toString() }
    ]
  }).sort({ timestamp: 1 });

  console.log(`Found ${logs.length} leads to revert.`);

  if (logs.length === 0) {
    console.log('No leads found to revert. Exiting.');
    await mongoose.disconnect();
    return;
  }

  // Load user map for logging
  const users = await User.find({}, 'fullName email');
  const userMap = {};
  for (const u of users) {
    userMap[u._id.toString()] = u.fullName;
  }

  let successCount = 0;
  let skipCount = 0;

  for (const log of logs) {
    const leadId = log.resourceId;
    const lead = await Lead.findById(leadId);

    if (!lead) {
      console.warn(`⚠️ Lead ID ${leadId} not found in database. Skipping.`);
      skipCount++;
      continue;
    }

    // Safety check: ensure lead is still currently assigned to Ramphawung Makang
    if (lead.assignedTo?.toString() !== targetUser._id.toString()) {
      console.warn(`⚠️ Lead "${lead.name}" (ID: ${leadId}) is currently assigned to ${userMap[lead.assignedTo?.toString()] || lead.assignedTo || 'None'}, NOT Ramphawung Makang. Skipping to avoid overwriting intentional updates.`);
      skipCount++;
      continue;
    }

    const prevAssigneeId = log.previousState?.assignedTo;
    const prevStatus = log.previousState?.status;

    const oldAssigneeName = prevAssigneeId ? (userMap[prevAssigneeId.toString()] || prevAssigneeId) : 'None';
    const oldStatus = prevStatus || 'New';

    console.log(`Reverting lead "${lead.name}" (${leadId}): Assignee -> ${oldAssigneeName}, Status -> ${oldStatus}`);

    // Perform reversion
    lead.assignedTo = prevAssigneeId || undefined;
    lead.status = oldStatus;
    lead.updatedAt = new Date();

    await lead.save();
    successCount++;
  }

  console.log(`\nReversion finished. Successfully reverted ${successCount} leads, skipped ${skipCount} leads.`);
  await mongoose.disconnect();
  console.log('Disconnected.');
}

run().catch(err => {
  console.error('Reversion error:', err);
  process.exit(1);
});
