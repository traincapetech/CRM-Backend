const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Sale = require('./models/Sale');
const LeadPersonSale = require('./models/LeadPersonSale');
const User = require('./models/User');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function checkHarshSales() {
  try {
    // Connect to MongoDB
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI environment variable is required');
    }
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB\n');

    // Find user with name "harsh" (case-insensitive) - check all variations
    const harshUsers = await User.find({
      $or: [
        { fullName: { $regex: /^harsh$/i } },
        { fullName: { $regex: /harsh/i } },
        { email: { $regex: /harsh/i } }
      ]
    });

    if (harshUsers.length === 0) {
      console.log('❌ No user found with name "harsh"');
      process.exit(1);
    }

    console.log(`Found ${harshUsers.length} user(s) with name containing "harsh":\n`);
    harshUsers.forEach(user => {
      console.log(`  - ${user.fullName} (ID: ${user._id}, Email: ${user.email}, Role: ${user.role})`);
    });

    // Collect all harsh user IDs
    const harshUserIds = harshUsers.map(u => u._id);

    // Check sales for each harsh user
    for (const harshUser of harshUsers) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Checking sales for: ${harshUser.fullName} (${harshUser._id})`);
      console.log(`${'='.repeat(60)}\n`);

      // Count sales in Sale collection - as leadPerson
      const saleCountAsLead = await Sale.countDocuments({
        leadPerson: harshUser._id
      });

      // Count sales in Sale collection - as salesPerson
      const saleCountAsSales = await Sale.countDocuments({
        salesPerson: harshUser._id
      });

      // Count sales in Sale collection - as createdBy
      const saleCountAsCreator = await Sale.countDocuments({
        createdBy: harshUser._id
      });

      // Count sales in Sale collection - as updatedBy
      const saleCountAsUpdater = await Sale.countDocuments({
        updatedBy: harshUser._id
      });

      // Count sales in Sale collection - where leadBy contains "harsh"
      const saleCountAsLeadBy = await Sale.countDocuments({
        leadBy: { $regex: /harsh/i }
      });

      // Count sales in LeadPersonSale collection - as leadPerson
      const leadPersonSaleCountAsLead = await LeadPersonSale.countDocuments({
        leadPerson: harshUser._id
      });

      // Count sales in LeadPersonSale collection - as salesPerson
      const leadPersonSaleCountAsSales = await LeadPersonSale.countDocuments({
        salesPerson: harshUser._id
      });

      // Count sales in LeadPersonSale collection - as createdBy
      const leadPersonSaleCountAsCreator = await LeadPersonSale.countDocuments({
        createdBy: harshUser._id
      });

      // Count sales in LeadPersonSale collection - as updatedBy
      const leadPersonSaleCountAsUpdater = await LeadPersonSale.countDocuments({
        updatedBy: harshUser._id
      });

      // Get ALL sales where harsh is involved in any way (Sale collection)
      const allSalesAsLead = await Sale.find({
        leadPerson: harshUser._id
      })
        .populate('salesPerson', 'fullName email')
        .populate('leadPerson', 'fullName email')
        .populate('createdBy', 'fullName email')
        .populate('updatedBy', 'fullName email')
        .sort({ date: -1 })
        .lean();

      const allSalesAsSales = await Sale.find({
        salesPerson: harshUser._id
      })
        .populate('salesPerson', 'fullName email')
        .populate('leadPerson', 'fullName email')
        .populate('createdBy', 'fullName email')
        .populate('updatedBy', 'fullName email')
        .sort({ date: -1 })
        .lean();

      // Check sales where leadBy field contains "harsh"
      const allSalesAsLeadBy = await Sale.find({
        leadBy: { $regex: /harsh/i }
      })
        .populate('salesPerson', 'fullName email')
        .populate('leadPerson', 'fullName email')
        .populate('createdBy', 'fullName email')
        .populate('updatedBy', 'fullName email')
        .sort({ date: -1 })
        .lean();

      // Check sales where customerName or other text fields might contain harsh
      const allSalesAsText = await Sale.find({
        $or: [
          { customerName: { $regex: /harsh/i } },
          { clientRemark: { $regex: /harsh/i } },
          { feedback: { $regex: /harsh/i } },
          { notes: { $regex: /harsh/i } }
        ]
      })
        .populate('salesPerson', 'fullName email')
        .populate('leadPerson', 'fullName email')
        .populate('createdBy', 'fullName email')
        .populate('updatedBy', 'fullName email')
        .sort({ date: -1 })
        .lean();

      // Combine and deduplicate sales
      const allSalesMap = new Map();
      [...allSalesAsLead, ...allSalesAsSales, ...allSalesAsLeadBy, ...allSalesAsText].forEach(sale => {
        allSalesMap.set(sale._id.toString(), sale);
      });
      const sales = Array.from(allSalesMap.values());

      // Get ALL sales from LeadPersonSale collection
      const allLeadPersonSalesAsLead = await LeadPersonSale.find({
        leadPerson: harshUser._id
      })
        .populate('salesPerson', 'fullName email')
        .populate('leadPerson', 'fullName email')
        .populate('createdBy', 'fullName email')
        .populate('updatedBy', 'fullName email')
        .sort({ date: -1 })
        .lean();

      const allLeadPersonSalesAsSales = await LeadPersonSale.find({
        salesPerson: harshUser._id
      })
        .populate('salesPerson', 'fullName email')
        .populate('leadPerson', 'fullName email')
        .populate('createdBy', 'fullName email')
        .populate('updatedBy', 'fullName email')
        .sort({ date: -1 })
        .lean();

      // Combine and deduplicate lead person sales
      const allLeadPersonSalesMap = new Map();
      [...allLeadPersonSalesAsLead, ...allLeadPersonSalesAsSales].forEach(sale => {
        allLeadPersonSalesMap.set(sale._id.toString(), sale);
      });
      const leadPersonSales = Array.from(allLeadPersonSalesMap.values());

      console.log(`📊 Sales Summary (Comprehensive):`);
      console.log(`\n   Sale Collection:`);
      console.log(`   - As Lead Person: ${saleCountAsLead}`);
      console.log(`   - As Sales Person: ${saleCountAsSales}`);
      console.log(`   - As Creator: ${saleCountAsCreator}`);
      console.log(`   - As Updater: ${saleCountAsUpdater}`);
      console.log(`   - In leadBy field: ${saleCountAsLeadBy}`);
      console.log(`   - Total Unique Sales: ${sales.length}`);
      console.log(`\n   LeadPersonSale Collection:`);
      console.log(`   - As Lead Person: ${leadPersonSaleCountAsLead}`);
      console.log(`   - As Sales Person: ${leadPersonSaleCountAsSales}`);
      console.log(`   - As Creator: ${leadPersonSaleCountAsCreator}`);
      console.log(`   - As Updater: ${leadPersonSaleCountAsUpdater}`);
      console.log(`   - Total Unique Sales: ${leadPersonSales.length}`);
      console.log(`\n   🎯 GRAND TOTAL: ${sales.length + leadPersonSales.length} unique sales\n`);

      if (sales.length > 0) {
        console.log(`📋 Sales from Sale collection (${sales.length}):`);
        sales.forEach((sale, index) => {
          const roles = [];
          if (sale.leadPerson?._id?.toString() === harshUser._id.toString()) roles.push('Lead Person');
          if (sale.salesPerson?._id?.toString() === harshUser._id.toString()) roles.push('Sales Person');
          if (sale.createdBy?._id?.toString() === harshUser._id.toString()) roles.push('Creator');
          if (sale.updatedBy?._id?.toString() === harshUser._id.toString()) roles.push('Updater');
          if (sale.leadBy && /harsh/i.test(sale.leadBy)) roles.push('In leadBy field');
          
          console.log(`\n   ${index + 1}. Customer: ${sale.customerName}`);
          console.log(`      Date: ${new Date(sale.date).toLocaleDateString()}`);
          console.log(`      Course: ${sale.course}`);
          console.log(`      Country: ${sale.country}`);
          console.log(`      Sales Person: ${sale.salesPerson?.fullName || 'N/A'}`);
          console.log(`      Lead Person: ${sale.leadPerson?.fullName || 'N/A'}`);
          console.log(`      Lead By: ${sale.leadBy || 'N/A'}`);
          console.log(`      Status: ${sale.status || 'Pending'}`);
          console.log(`      Total Cost: ${sale.totalCost || 0} ${sale.totalCostCurrency || 'USD'}`);
          console.log(`      Is Lead Person Sale: ${sale.isLeadPersonSale ? 'Yes' : 'No'}`);
          console.log(`      Harsh's Role: ${roles.join(', ') || 'N/A'}`);
          console.log(`      Created At: ${sale.createdAt ? new Date(sale.createdAt).toLocaleString() : 'N/A'}`);
          console.log(`      Updated At: ${sale.updatedAt ? new Date(sale.updatedAt).toLocaleString() : 'N/A'}`);
        });
      }

      if (leadPersonSales.length > 0) {
        console.log(`\n📋 Sales from LeadPersonSale collection (${leadPersonSales.length}):`);
        leadPersonSales.forEach((sale, index) => {
          const roles = [];
          if (sale.leadPerson?._id?.toString() === harshUser._id.toString()) roles.push('Lead Person');
          if (sale.salesPerson?._id?.toString() === harshUser._id.toString()) roles.push('Sales Person');
          if (sale.createdBy?._id?.toString() === harshUser._id.toString()) roles.push('Creator');
          if (sale.updatedBy?._id?.toString() === harshUser._id.toString()) roles.push('Updater');
          
          console.log(`\n   ${index + 1}. Customer: ${sale.customerName}`);
          console.log(`      Date: ${new Date(sale.date).toLocaleDateString()}`);
          console.log(`      Course: ${sale.course}`);
          console.log(`      Country: ${sale.country}`);
          console.log(`      Sales Person: ${sale.salesPerson?.fullName || 'N/A'}`);
          console.log(`      Lead Person: ${sale.leadPerson?.fullName || 'N/A'}`);
          console.log(`      Status: ${sale.status || 'Pending'}`);
          console.log(`      Total Cost: ${sale.totalCost || 0} ${sale.totalCostCurrency || 'USD'}`);
          console.log(`      Harsh's Role: ${roles.join(', ') || 'N/A'}`);
          console.log(`      Created At: ${sale.createdAt ? new Date(sale.createdAt).toLocaleString() : 'N/A'}`);
          console.log(`      Updated At: ${sale.updatedAt ? new Date(sale.updatedAt).toLocaleString() : 'N/A'}`);
        });
      }

      // Count updated sales (sales that have been modified after creation)
      const updatedSalesCount = sales.filter(sale => {
        if (!sale.createdAt || !sale.updatedAt) return false;
        return new Date(sale.updatedAt).getTime() > new Date(sale.createdAt).getTime();
      }).length;

      const updatedLeadPersonSalesCount = leadPersonSales.filter(sale => {
        if (!sale.createdAt || !sale.updatedAt) return false;
        return new Date(sale.updatedAt).getTime() > new Date(sale.createdAt).getTime();
      }).length;

      console.log(`\n🔄 Updated Sales Count:`);
      console.log(`   - Updated Sales in Sale collection: ${updatedSalesCount}`);
      console.log(`   - Updated Sales in LeadPersonSale collection: ${updatedLeadPersonSalesCount}`);
      console.log(`   - Total Updated Sales: ${updatedSalesCount + updatedLeadPersonSalesCount}`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ Query completed successfully');
    console.log(`${'='.repeat(60)}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkHarshSales();

