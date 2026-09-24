const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Sale = require('../models/Sale');
const LeadPersonSale = require('../models/LeadPersonSale');

async function run() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/traincape_crm';
  console.log('Connecting to database...');
  await mongoose.connect(mongoUri);
  console.log('Connected.');

  // Fix Sales
  console.log('Finding completed Sales where tokenAmount !== totalCost or pending !== false...');
  const completedSales = await Sale.find({
    status: 'Completed',
    $or: [
      { pending: { $ne: false } },
      { $expr: { $ne: ['$tokenAmount', '$totalCost'] } }
    ]
  });

  console.log(`Found ${completedSales.length} Sales to fix.`);

  let fixedSalesCount = 0;
  for (const sale of completedSales) {
    sale.tokenAmount = sale.totalCost;
    sale.pending = false;
    await sale.save();
    fixedSalesCount++;
    console.log(`Fixed Sale ID ${sale._id} (${sale.customerName}) - Set Paid: ${sale.tokenAmount}, Pending: false`);
  }

  // Fix LeadPersonSales
  console.log('Finding completed LeadPersonSales where tokenAmount !== totalCost...');
  const completedLPSales = await LeadPersonSale.find({
    status: 'Completed',
    $or: [
      { pending: { $ne: false } },
      { $expr: { $ne: ['$tokenAmount', '$totalCost'] } }
    ]
  });

  console.log(`Found ${completedLPSales.length} LeadPersonSales to fix.`);

  let fixedLPSalesCount = 0;
  for (const sale of completedLPSales) {
    sale.tokenAmount = sale.totalCost;
    sale.pending = false;
    await sale.save();
    fixedLPSalesCount++;
    console.log(`Fixed LeadPersonSale ID ${sale._id} (${sale.customerName}) - Set Paid: ${sale.tokenAmount}, Pending: false`);
  }

  console.log('Migration finished.');
  console.log(`Total Sales updated: ${fixedSalesCount}`);
  console.log(`Total LeadPersonSales updated: ${fixedLPSalesCount}`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
