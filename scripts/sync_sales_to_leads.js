const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Sale = require('../models/Sale');
const Lead = require('../models/Lead');
const { hashForSearch } = require('../utils/encryption');

async function syncSalesToLeads({ normalOnly = true, dryRun = false } = {}) {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/traincape_crm';
  console.log(`Connecting to database...`);
  await mongoose.connect(mongoUri);
  console.log(`Connected. Mode: ${normalOnly ? 'NORMAL SALES ONLY' : 'ALL SALES (NORMAL + REFERENCE)'}, DryRun: ${dryRun}`);

  const saleFilter = {
    status: { $in: ['Completed', 'Pending'] }
  };
  if (normalOnly) {
    saleFilter.$or = [
      { isReference: false },
      { source: { $ne: 'Reference' } }
    ];
  }

  const sales = await Sale.find(saleFilter).select('customerName email contactNumber course status source isReference totalCost date');
  console.log(`Found ${sales.length} candidate sales.`);

  let matchedCount = 0;
  let updatedCount = 0;
  let alreadyConvertedCount = 0;
  const leadUpdates = [];

  for (const s of sales) {
    let lead = null;
    if (s.email) {
      lead = await Lead.findOne({ emailHash: hashForSearch(s.email.trim()) });
    }
    if (!lead && s.contactNumber) {
      const cleanPhone = s.contactNumber.replace(/\D/g, '');
      if (cleanPhone.length >= 7) {
        lead = await Lead.findOne({ phoneHash: hashForSearch(cleanPhone) });
      }
    }
    if (!lead && s.customerName) {
      lead = await Lead.findOne({ name: new RegExp('^' + s.customerName.trim() + '$', 'i') });
    }

    if (lead) {
      matchedCount++;
      if (lead.status === 'Converted' || lead.status === 'Payment') {
        alreadyConvertedCount++;
      } else {
        leadUpdates.push({
          leadId: lead._id,
          leadName: lead.name,
          oldStatus: lead.status || '(blank)',
          saleId: s._id,
          saleCustomer: s.customerName,
          saleCourse: s.course,
          saleSource: s.source
        });

        if (!dryRun) {
          lead.status = 'Converted';
          if (!lead.remarks) {
            lead.remarks = `Converted via sale: ${s.course} (${s.customerName})`;
          }
          await lead.save();
          updatedCount++;
        }
      }
    }
  }

  console.log('--------------------------------------------------');
  console.log(`Sales matched to existing leads: ${matchedCount}`);
  console.log(`Leads already marked Converted/Payment: ${alreadyConvertedCount}`);
  console.log(`Leads ${dryRun ? 'to be updated' : 'successfully updated'} to "Converted": ${dryRun ? leadUpdates.length : updatedCount}`);
  console.log('--------------------------------------------------');

  await mongoose.disconnect();
  return { matchedCount, alreadyConvertedCount, updatedCount: dryRun ? leadUpdates.length : updatedCount, leadUpdates };
}

if (require.main === module) {
  const isAll = process.argv.includes('--all');
  const isDryRun = process.argv.includes('--dry-run');
  syncSalesToLeads({ normalOnly: !isAll, dryRun: isDryRun })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Sync failed:', err);
      process.exit(1);
    });
}

module.exports = syncSalesToLeads;

