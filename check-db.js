const mongoose = require('mongoose');
const Sale = require('./models/Sale');

async function checkDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/crm');
    console.log('Connected to MongoDB');
    
    const totalSales = await Sale.countDocuments();
    console.log('Total sales in database:', totalSales);
    
    const sales = await Sale.find().limit(3);
    console.log('Sample sales count:', sales.length);
    if (sales.length > 0) {
      console.log('First sale:', JSON.stringify(sales[0], null, 2));
    }
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkDatabase(); 