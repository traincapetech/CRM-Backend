const mongoose = require('mongoose');
const Invoice = require('./models/Invoice');
require('dotenv').config();

async function testInvoiceData() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/crm');
    console.log('✅ Connected to database');
    
    // Get the specific invoice
    const invoice = await Invoice.findById('6888c74eb1cc2ec187ceeec3');
    
    if (!invoice) {
      console.log('❌ Invoice not found');
      return;
    }
    
    console.log('📄 Invoice found:', invoice.invoiceNumber);
    console.log('💰 Total Amount:', invoice.totalAmount);
    console.log('📦 Items:', invoice.items.length);
    
    invoice.items.forEach((item, index) => {
      console.log(`\n📦 Item ${index + 1}:`);
      console.log('  Description:', item.description);
      console.log('  Quantity:', item.quantity);
      console.log('  Unit Price:', item.unitPrice);
      console.log('  Total:', item.total);
      console.log('  Tax Rate:', item.taxRate);
      console.log('  Tax Amount:', item.taxAmount);
      console.log('  Subtotal:', item.subtotal);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testInvoiceData(); 