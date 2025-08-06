const mongoose = require('mongoose');
const Sale = require('./models/Sale');
const currencyService = require('./services/currencyService');

async function testComprehensiveRevenue() {
  try {
    console.log('🔄 Testing Comprehensive Revenue Analysis...\n');
    
    await mongoose.connect('mongodb+srv://traincape:parichay@traincapetechnology.1p6rbwq.mongodb.net/CRM?retryWrites=true&w=majority&appName=TraincapeTechnology');
    
    // Get ALL sales excluding cancelled ones
    const sales = await Sale.find({ status: { $ne: 'Cancelled' } });
    console.log(`📊 Total sales (excluding cancelled): ${sales.length}`);
    
    // Get exchange rates
    const exchangeRates = await currencyService.getExchangeRates();
    
    let totalRevenueUSD = 0;
    let totalCourseValueUSD = 0;
    let totalSalesCount = 0;
    let pendingAmountUSD = 0;
    let completedRevenueUSD = 0;
    let pendingRevenueUSD = 0;
    
    const statusBreakdown = {
      'Pending': { sales: 0, courseValue: 0, revenue: 0, pending: 0 },
      'Completed': { sales: 0, courseValue: 0, revenue: 0, pending: 0 }
    };
    
    const currencyBreakdown = {};
    
    console.log('\n📋 Processing each sale...');
    console.log('='.repeat(100));
    
    sales.forEach((sale, index) => {
      const currency = sale.currency || 'USD';
      const status = sale.status || 'Pending';
      
      // Convert to USD
      const courseValueUSD = currencyService.convertToUSD(sale.totalCost, currency);
      const paymentUSD = currencyService.convertToUSD(sale.tokenAmount, currency);
      const pendingUSD = courseValueUSD - paymentUSD;
      
      // Update totals
      totalRevenueUSD += paymentUSD;
      totalCourseValueUSD += courseValueUSD;
      totalSalesCount += 1;
      pendingAmountUSD += pendingUSD;
      
      // Update status breakdown
      if (status === 'Completed') {
        completedRevenueUSD += paymentUSD;
        statusBreakdown['Completed'].sales += 1;
        statusBreakdown['Completed'].courseValue += courseValueUSD;
        statusBreakdown['Completed'].revenue += paymentUSD;
        statusBreakdown['Completed'].pending += pendingUSD;
      } else if (status === 'Pending') {
        pendingRevenueUSD += paymentUSD;
        statusBreakdown['Pending'].sales += 1;
        statusBreakdown['Pending'].courseValue += courseValueUSD;
        statusBreakdown['Pending'].revenue += paymentUSD;
        statusBreakdown['Pending'].pending += pendingUSD;
      }
      
      // Update currency breakdown
      if (!currencyBreakdown[currency]) {
        currencyBreakdown[currency] = {
          totalSales: 0,
          totalCourseValue: 0,
          totalRevenue: 0,
          courseValueUSD: 0,
          revenueUSD: 0,
          pendingUSD: 0
        };
      }
      
      currencyBreakdown[currency].totalSales += 1;
      currencyBreakdown[currency].totalCourseValue += sale.totalCost;
      currencyBreakdown[currency].totalRevenue += sale.tokenAmount;
      currencyBreakdown[currency].courseValueUSD += courseValueUSD;
      currencyBreakdown[currency].revenueUSD += paymentUSD;
      currencyBreakdown[currency].pendingUSD += pendingUSD;
      
      // Log every 20th sale for debugging
      if ((index + 1) % 20 === 0 || index < 5) {
        console.log(`${index + 1}. ${sale.course} (${status})`);
        console.log(`   Course: ${sale.totalCost} ${currency} = $${courseValueUSD.toFixed(2)} USD`);
        console.log(`   Payment: ${sale.tokenAmount} ${currency} = $${paymentUSD.toFixed(2)} USD`);
        console.log(`   Pending: $${pendingUSD.toFixed(2)} USD`);
        console.log('');
      }
    });
    
    console.log('\n💰 COMPREHENSIVE REVENUE SUMMARY:');
    console.log('='.repeat(100));
    console.log(`Total Sales: ${totalSalesCount}`);
    console.log(`Total Course Value: $${totalCourseValueUSD.toFixed(2)} USD`);
    console.log(`Total Revenue (Payments Received): $${totalRevenueUSD.toFixed(2)} USD`);
    console.log(`Total Pending Amount: $${pendingAmountUSD.toFixed(2)} USD`);
    console.log('');
    
    console.log('📊 STATUS BREAKDOWN:');
    console.log('='.repeat(100));
    Object.entries(statusBreakdown).forEach(([status, data]) => {
      console.log(`${status}:`);
      console.log(`  Sales: ${data.sales}`);
      console.log(`  Course Value: $${data.courseValue.toFixed(2)} USD`);
      console.log(`  Revenue: $${data.revenue.toFixed(2)} USD`);
      console.log(`  Pending: $${data.pending.toFixed(2)} USD`);
      console.log('');
    });
    
    console.log('💱 CURRENCY BREAKDOWN:');
    console.log('='.repeat(100));
    Object.entries(currencyBreakdown).forEach(([currency, data]) => {
      console.log(`${currency}:`);
      console.log(`  Sales: ${data.totalSales}`);
      console.log(`  Course Value: ${data.totalCourseValue} ${currency} = $${data.courseValueUSD.toFixed(2)} USD`);
      console.log(`  Revenue: ${data.totalRevenue} ${currency} = $${data.revenueUSD.toFixed(2)} USD`);
      console.log(`  Pending: $${data.pendingUSD.toFixed(2)} USD`);
      console.log('');
    });
    
    console.log('✅ VERIFICATION:');
    console.log('='.repeat(100));
    console.log(`Your manual count: $15,367 USD pending`);
    console.log(`System calculation: $${pendingAmountUSD.toFixed(2)} USD pending`);
    console.log(`Difference: $${Math.abs(pendingAmountUSD - 15367).toFixed(2)} USD`);
    console.log(`Match: ${Math.abs(pendingAmountUSD - 15367) < 100 ? '✅ CLOSE MATCH' : '❌ SIGNIFICANT DIFFERENCE'}`);
    
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error testing comprehensive revenue:', error);
    await mongoose.disconnect();
  }
}

// Run the test
testComprehensiveRevenue(); 