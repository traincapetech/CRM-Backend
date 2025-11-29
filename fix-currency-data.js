const mongoose = require('mongoose');
const Sale = require('./models/Sale');
require('dotenv').config();

const fixCurrencyData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find the sale for Pradeep with the specific amounts
    const sale = await Sale.findOne({
      customerName: 'Pradeep',
      totalCost: 15000,
      tokenAmount: 5000,
      totalCostCurrency: 'USD'
    });

    if (sale) {
      console.log('Found sale:', {
        id: sale._id,
        customer: sale.customerName,
        totalCost: sale.totalCost,
        totalCostCurrency: sale.totalCostCurrency,
        tokenAmount: sale.tokenAmount,
        tokenAmountCurrency: sale.tokenAmountCurrency
      });

      // Update the currency fields to INR
      sale.totalCostCurrency = 'INR';
      sale.tokenAmountCurrency = 'INR';
      sale.currency = 'INR';

      await sale.save();
      console.log('✅ Successfully updated currency to INR');
      
      // Verify the update
      const updatedSale = await Sale.findById(sale._id);
      console.log('Updated sale:', {
        id: updatedSale._id,
        customer: updatedSale.customerName,
        totalCost: updatedSale.totalCost,
        totalCostCurrency: updatedSale.totalCostCurrency,
        tokenAmount: updatedSale.tokenAmount,
        tokenAmountCurrency: updatedSale.tokenAmountCurrency,
        currency: updatedSale.currency
      });
    } else {
      console.log('❌ Sale not found with the specified criteria');
      
      // Let's search more broadly
      const allPradeepSales = await Sale.find({ customerName: 'Pradeep' });
      console.log(`Found ${allPradeepSales.length} sales for Pradeep:`);
      allPradeepSales.forEach(sale => {
        console.log({
          id: sale._id,
          customer: sale.customerName,
          totalCost: sale.totalCost,
          totalCostCurrency: sale.totalCostCurrency,
          tokenAmount: sale.tokenAmount,
          tokenAmountCurrency: sale.tokenAmountCurrency,
          date: sale.date
        });
      });
    }

  } catch (error) {
    console.error('Error fixing currency data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the fix
fixCurrencyData(); 