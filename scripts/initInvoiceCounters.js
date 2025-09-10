const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Counter = require('../models/Counter');
require('dotenv').config();

async function initCounters() {
  try {
    const uri = process.env.MONGO_URI || process.env.Mongo_URI || process.env.MONGOURL;
    if (!uri) {
      throw new Error('Missing MONGO_URI in environment');
    }
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // Group invoices by year and find max sequence used
    const invoices = await Invoice.find({ isDeleted: false }, { invoiceNumber: 1 }).lean();
    const maxByYear = new Map();

    for (const inv of invoices) {
      const match = /^INV-(\d{4})-(\d+)/.exec(inv.invoiceNumber || '');
      if (!match) continue;
      const year = match[1];
      const seq = parseInt(match[2], 10) || 0;
      const current = maxByYear.get(year) || 0;
      if (seq > current) maxByYear.set(year, seq);
    }

    // Update counters so next issue is max+1
    for (const [year, maxSeq] of maxByYear.entries()) {
      const key = `invoice-${year}`;
      const nextSeq = maxSeq; // counter stores last issued; generator will +1
      await Counter.findOneAndUpdate(
        { key },
        { $set: { seq: nextSeq } },
        { upsert: true }
      );
      console.log(`Initialized counter ${key} to ${nextSeq}`);
    }

    await mongoose.disconnect();
    console.log('Done');
  } catch (err) {
    console.error('Error initializing counters:', err);
    process.exitCode = 1;
  }
}

initCounters();


