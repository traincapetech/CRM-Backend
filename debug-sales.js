const mongoose = require('mongoose');
const Sale = require('./models/Sale');

async function debugSales() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/crm');
    console.log('Connected to MongoDB');
    
    // Get all sales without any filters
    const allSales = await Sale.find({});
    console.log('Total sales in database (no filter):', allSales.length);
    
    // Group by different criteria to understand the data
    const salesByCreatedBy = {};
    const salesByLeadPerson = {};
    const salesByIsLeadPersonSale = { true: 0, false: 0, undefined: 0 };
    
    allSales.forEach(sale => {
      // Group by createdBy
      const createdBy = sale.createdBy ? sale.createdBy.toString() : 'null';
      salesByCreatedBy[createdBy] = (salesByCreatedBy[createdBy] || 0) + 1;
      
      // Group by leadPerson
      const leadPerson = sale.leadPerson ? sale.leadPerson.toString() : 'null';
      salesByLeadPerson[leadPerson] = (salesByLeadPerson[leadPerson] || 0) + 1;
      
      // Group by isLeadPersonSale
      const isLeadPersonSale = sale.isLeadPersonSale;
      if (isLeadPersonSale === true) salesByIsLeadPersonSale.true++;
      else if (isLeadPersonSale === false) salesByIsLeadPersonSale.false++;
      else salesByIsLeadPersonSale.undefined++;
    });
    
    console.log('\nSales by createdBy:');
    Object.entries(salesByCreatedBy).forEach(([key, count]) => {
      console.log(`  ${key}: ${count}`);
    });
    
    console.log('\nSales by leadPerson:');
    Object.entries(salesByLeadPerson).forEach(([key, count]) => {
      console.log(`  ${key}: ${count}`);
    });
    
    console.log('\nSales by isLeadPersonSale:');
    console.log(`  true: ${salesByIsLeadPersonSale.true}`);
    console.log(`  false: ${salesByIsLeadPersonSale.false}`);
    console.log(`  undefined: ${salesByIsLeadPersonSale.undefined}`);
    
    // Check what query would return for admin user
    const adminUserId = '6835608d5d2b8c84dcbc9666';
    console.log(`\nChecking what admin user ${adminUserId} would see:`);
    
    // This simulates the query from the controller for Admin role
    const adminQuery = Sale.find({});
    const adminSales = await adminQuery;
    console.log('Admin query result count:', adminSales.length);
    
    // Check recent sales
    const recentSales = await Sale.find({}).sort({ date: -1 }).limit(5);
    console.log('\nMost recent 5 sales:');
    recentSales.forEach((sale, index) => {
      console.log(`  ${index + 1}. ${sale.customerName} - ${sale.course} - ${sale.date} - isLeadPersonSale: ${sale.isLeadPersonSale}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

debugSales(); 