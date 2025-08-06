const mongoose = require('mongoose');
const currencyService = require('./services/currencyService');

// Sample sales data with mixed currencies
const sampleSales = [
  {
    course: 'PMI',
    totalCost: 500, // Course price in USD
    tokenAmount: 50, // Payment received in USD
    currency: 'USD'
  },
  {
    course: 'PMP',
    totalCost: 300, // Course price in USD
    tokenAmount: 25, // Payment received in USD
    currency: 'USD'
  },
  {
    course: 'Comptia A+',
    totalCost: 300, // Course price in USD
    tokenAmount: 10000, // Payment received in INR
    currency: 'INR'
  },
  {
    course: 'GOOGLE CLOUD',
    totalCost: 150, // Course price in USD
    tokenAmount: 150, // Payment received in USD
    currency: 'USD'
  },
  {
    course: 'Az-500',
    totalCost: 150, // Course price in USD
    tokenAmount: 150, // Payment received in USD
    currency: 'USD'
  }
];

async function testCurrencyConversion() {
  try {
    console.log('🔄 Testing Currency Conversion...\n');
    
    // Get exchange rates
    const rates = await currencyService.getExchangeRates();
    console.log('📊 Current Exchange Rates:');
    console.log('USD: 1.00');
    console.log('INR:', rates.INR);
    console.log('EUR:', rates.EUR);
    console.log('GBP:', rates.GBP);
    console.log('');
    
    let totalRevenueUSD = 0;
    let totalCourseValueUSD = 0;
    
    console.log('📋 Sales Analysis:');
    console.log('='.repeat(80));
    
    sampleSales.forEach((sale, index) => {
      const coursePriceUSD = currencyService.convertToUSD(sale.totalCost, sale.currency);
      const paymentUSD = currencyService.convertToUSD(sale.tokenAmount, sale.currency);
      
      totalRevenueUSD += paymentUSD;
      totalCourseValueUSD += coursePriceUSD;
      
      console.log(`${index + 1}. ${sale.course}`);
      console.log(`   Course Price: ${sale.totalCost} ${sale.currency} = $${coursePriceUSD.toFixed(2)} USD`);
      console.log(`   Payment: ${sale.tokenAmount} ${sale.currency} = $${paymentUSD.toFixed(2)} USD`);
      console.log(`   Pending: $${(coursePriceUSD - paymentUSD).toFixed(2)} USD`);
      console.log('');
    });
    
    const pendingAmount = totalCourseValueUSD - totalRevenueUSD;
    
    console.log('💰 SUMMARY:');
    console.log('='.repeat(80));
    console.log(`Total Course Value: $${totalCourseValueUSD.toFixed(2)} USD`);
    console.log(`Total Payments Received: $${totalRevenueUSD.toFixed(2)} USD`);
    console.log(`Pending Amount: $${pendingAmount.toFixed(2)} USD`);
    console.log('');
    
    // Verify the calculation
    console.log('✅ VERIFICATION:');
    console.log('='.repeat(80));
    console.log('Expected: 10000 INR + 150 USD + 50 USD + 25 USD + 150 USD = 150 USD + 114.50 USD + 50 USD + 25 USD + 150 USD = 489.50 USD');
    console.log(`Actual: $${totalRevenueUSD.toFixed(2)} USD`);
    console.log(`Match: ${Math.abs(totalRevenueUSD - 489.50) < 1 ? '✅ PASS' : '❌ FAIL'}`);
    
  } catch (error) {
    console.error('❌ Error testing currency conversion:', error);
  }
}

// Run the test
testCurrencyConversion(); 