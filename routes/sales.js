const express = require('express');
const router = express.Router();
const {
  getSales,
  getSale,
  createSale,
  updateSale,
  deleteSale,
  getSalesCount,
  importSales
} = require('../controllers/sales');

const { protect, authorize } = require('../middleware/auth');
const Sale = require('../models/Sale');

// All routes below this line require authentication
router.use(protect);

// Routes specific to roles
router.route('/')
  .get(authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), getSales)
  .post(authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), createSale);

// Import route (Admin only)
router.post('/import', authorize('Admin'), importSales);

// Count route
router.get('/count', authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), getSalesCount);

router.route('/:id')
  .get(authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), getSale)
  .put(authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), updateSale)
  .delete(authorize('Sales Person','Manager', 'Admin'), deleteSale);

// Routes for token and pending amount updates - TODO: Implement these functions
// router.route('/:id/token')
//   .put(authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), updateToken);

// router.route('/:id/pending')
//   .put(authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), updatePending);

// @route   GET /api/sales/lead-sheet
// @desc    Get sales sheet data for lead persons
// @access  Private (Lead Person, Manager, Admin)
router.get('/lead-sheet', authorize('Lead Person', 'Manager', 'Admin'), async (req, res) => {
  try {
    
    // Get query parameters for filtering
    const { startDate, endDate, leadPerson, salesPerson } = req.query;
    
    // Build filter object
    const filter = {
      isLeadPersonSale: true  // Always filter for lead person sales
    };
    
    // Date range filter
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    
    // Lead person filter - if user is a lead person, only show their leads
    // If admin or manager, allow filtering by lead person
    if (req.user.role === 'Lead Person') {
      // Convert to string ID for comparison
      const userId = req.user._id.toString();
      
      // Use mongoose ObjectId for the query
      const mongoose = require('mongoose');
      const ObjectId = mongoose.Types.ObjectId;
      
      try {
        filter.leadPerson = new ObjectId(userId);
      } catch (err) {
        // Fallback to string ID
        filter.leadPerson = userId;
      }
    } else if (leadPerson) {
      filter.leadPerson = leadPerson;
    }
    
    // Sales person filter
    if (salesPerson) {
      filter.salesPerson = salesPerson;
    }
    
    // Get sales data with all fields
    // Populate both leadPerson and salesPerson fields
    const sales = await Sale.find(filter)
      .select('date customerName country course countryCode contactNumber email pseudoId salesPerson leadPerson source clientRemark feedback totalCost totalCostCurrency tokenAmount tokenAmountCurrency currency')
      .populate('salesPerson', 'fullName')
      .populate('leadPerson', 'fullName')
      .sort({ date: -1 });
    
    // Post-process results to ensure currency fields exist and are consistent
    const processedSales = sales.map(sale => {
      const saleObj = sale.toObject();
      
      // Ensure currency fields are properly set
      // Priority: specific currency fields > general currency field > default USD
      if (!saleObj.totalCostCurrency) {
        saleObj.totalCostCurrency = saleObj.currency || 'USD';
      }
      if (!saleObj.tokenAmountCurrency) {
        saleObj.tokenAmountCurrency = saleObj.currency || 'USD';
      }
      
      // Also ensure the general currency field is set for consistency
      if (!saleObj.currency) {
        saleObj.currency = saleObj.totalCostCurrency || 'USD';
      }
      
      return saleObj;
    });
    
    res.status(200).json({
      success: true,
      count: processedSales.length,
      data: processedSales
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server error while fetching sales data',
      error: err.message
    });
  }
});

// Add comprehensive reports endpoints
router.get('/reports/course-analysis', protect, authorize('Admin', 'Manager'), async (req, res) => {
  try {
    const { period = 'monthly' } = req.query; // monthly, quarterly, half-yearly, yearly
    
    let dateFilter = {};
    const now = new Date();
    
    switch (period) {
      case 'monthly':
        // Last 12 months
        dateFilter = {
          $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1),
          $lte: now
        };
        break;
      case 'quarterly':
        // Last 4 quarters (12 months)
        dateFilter = {
          $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1),
          $lte: now
        };
        break;
      case 'half-yearly':
        // Last 3 years (6 half-year periods)
        dateFilter = {
          $gte: new Date(now.getFullYear() - 2, now.getMonth(), 1),
          $lte: now
        };
        break;
      case 'yearly':
        // Last 3 years
        dateFilter = {
          $gte: new Date(now.getFullYear() - 2, 0, 1),
          $lte: now
        };
        break;
    }

    const pipeline = [
      {
        $match: {
          date: dateFilter,
          status: { $ne: 'Cancelled' }
        }
      },
      {
        $group: {
          _id: {
            course: '$course',
            year: { $year: '$date' },
            month: { $month: '$date' },
            quarter: { $ceil: { $divide: [{ $month: '$date' }, 3] } }
          },
          totalSales: { $sum: 1 },
          totalRevenue: { $sum: { $ifNull: ['$totalCost', 0] } },
          averagePrice: { $avg: { $ifNull: ['$totalCost', 0] } }
        }
      },
      {
        $sort: { '_id.year': -1, '_id.month': -1 }
      }
    ];

    const results = await Sale.aggregate(pipeline);
    
    // Process results based on period
    const processedResults = {};
    
    results.forEach(item => {
      const course = item._id.course || 'Unknown Course';
      let periodKey = '';
      
      switch (period) {
        case 'monthly':
          periodKey = `${item._id.year}-${String(item._id.month).padStart(2, '0')}`;
          break;
        case 'quarterly':
          periodKey = `${item._id.year}-Q${item._id.quarter}`;
          break;
        case 'half-yearly':
          const halfYear = item._id.month <= 6 ? 'H1' : 'H2';
          periodKey = `${item._id.year}-${halfYear}`;
          break;
        case 'yearly':
          periodKey = `${item._id.year}`;
          break;
      }
      
      if (!processedResults[course]) {
        processedResults[course] = {};
      }
      
      if (!processedResults[course][periodKey]) {
        processedResults[course][periodKey] = {
          totalSales: 0,
          totalRevenue: 0,
          averagePrice: 0
        };
      }
      
      processedResults[course][periodKey].totalSales += item.totalSales;
      processedResults[course][periodKey].totalRevenue += item.totalRevenue || 0;
      processedResults[course][periodKey].averagePrice = item.averagePrice || 0;
    });

    res.json({
      success: true,
      data: {
        period,
        courseAnalysis: processedResults
      }
    });
  } catch (error) {
    console.error('Error in course analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating course analysis report',
      error: error.message
    });
  }
});

router.get('/reports/revenue-analysis', protect, authorize('Admin', 'Manager'), async (req, res) => {
  try {
    const { period = '1month' } = req.query; // 1month, 3month, 6month, 1year
    
    let dateFilter = {};
    const now = new Date();
    
    switch (period) {
      case '1month':
        dateFilter = {
          $gte: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
          $lte: now
        };
        break;
      case '3month':
        dateFilter = {
          $gte: new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()),
          $lte: now
        };
        break;
      case '6month':
        dateFilter = {
          $gte: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
          $lte: now
        };
        break;
      case '1year':
        dateFilter = {
          $gte: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
          $lte: now
        };
        break;
    }

    const pipeline = [
      {
        $match: {
          date: dateFilter,
          status: { $ne: 'Cancelled' }
        }
      },
      {
        $group: {
          _id: {
            currency: '$currency',
            status: '$status'
          },
          totalSales: { $sum: 1 },
          totalRevenue: { $sum: '$totalCost' },
          totalTokens: { $sum: '$tokenAmount' },
          averageOrderValue: { $avg: '$totalCost' }
        }
      }
    ];

    const results = await Sale.aggregate(pipeline);
    
    // Get exchange rates with fallback
    let exchangeRates = {
      'USD': 1,
      'EUR': 0.85,
      'GBP': 0.73,
      'INR': 83.12,
      'CAD': 1.36,
      'AUD': 1.52,
      'JPY': 149.50,
      'CNY': 7.24
    };
    
    try {
      const ExchangeRate = require('../models/ExchangeRate');
      const exchangeRateDoc = await ExchangeRate.findOne().sort({ updatedAt: -1 });
      if (exchangeRateDoc && exchangeRateDoc.rates) {
        exchangeRates = Object.fromEntries(exchangeRateDoc.rates);
      }
    } catch (err) {
      console.log('Using default exchange rates');
    }
    
    let totalRevenueUSD = 0;
    let totalTokensUSD = 0;
    let totalSalesCount = 0;
    const currencyBreakdown = {};
    
    results.forEach(item => {
      const currency = item._id.currency || 'USD';
      const rate = exchangeRates[currency] || 1;
      const revenueInUSD = item.totalRevenue / rate;
      const tokensInUSD = item.totalTokens / rate;
      
      totalRevenueUSD += revenueInUSD;
      totalTokensUSD += tokensInUSD;
      totalSalesCount += item.totalSales;
      
      if (!currencyBreakdown[currency]) {
        currencyBreakdown[currency] = {
          totalSales: 0,
          totalRevenue: 0,
          totalTokens: 0,
          revenueUSD: 0,
          tokensUSD: 0
        };
      }
      
      currencyBreakdown[currency].totalSales += item.totalSales;
      currencyBreakdown[currency].totalRevenue += item.totalRevenue;
      currencyBreakdown[currency].totalTokens += item.totalTokens;
      currencyBreakdown[currency].revenueUSD += revenueInUSD;
      currencyBreakdown[currency].tokensUSD += tokensInUSD;
    });

    // Get daily breakdown for the period
    const dailyPipeline = [
      {
        $match: {
          date: dateFilter,
          status: { $ne: 'Cancelled' }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            day: { $dayOfMonth: '$date' }
          },
          dailySales: { $sum: 1 },
          dailyRevenue: { $sum: '$totalCost' },
          dailyTokens: { $sum: '$tokenAmount' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ];

    const dailyResults = await Sale.aggregate(dailyPipeline);
    
    const dailyBreakdown = dailyResults.map(item => ({
      date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
      sales: item.dailySales,
      revenue: item.dailyRevenue,
      tokens: item.dailyTokens
    }));

    res.json({
      success: true,
      data: {
        period,
        summary: {
          totalSales: totalSalesCount,
          totalRevenueUSD: Math.round(totalRevenueUSD * 100) / 100,
          totalTokensUSD: Math.round(totalTokensUSD * 100) / 100,
          pendingAmountUSD: Math.round((totalRevenueUSD - totalTokensUSD) * 100) / 100,
          averageOrderValueUSD: totalSalesCount > 0 ? Math.round((totalRevenueUSD / totalSalesCount) * 100) / 100 : 0
        },
        currencyBreakdown,
        dailyBreakdown,
        exchangeRatesUsed: exchangeRates
      }
    });
  } catch (error) {
    console.error('Error in revenue analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating revenue analysis report'
    });
  }
});

router.get('/reports/top-courses', protect, authorize('Admin', 'Manager'), async (req, res) => {
  try {
    const { period = 'all', limit = 10 } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    if (period !== 'all') {
      switch (period) {
        case '1month':
          dateFilter = {
            $gte: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
            $lte: now
          };
          break;
        case '3month':
          dateFilter = {
            $gte: new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()),
            $lte: now
          };
          break;
        case '6month':
          dateFilter = {
            $gte: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
            $lte: now
          };
          break;
        case '1year':
          dateFilter = {
            $gte: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
            $lte: now
          };
          break;
      }
    }

    const matchStage = {
      status: { $ne: 'Cancelled' }
    };
    
    if (Object.keys(dateFilter).length > 0) {
      matchStage.date = dateFilter;
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$course',
          totalSales: { $sum: 1 },
          totalRevenue: { $sum: { $ifNull: ['$totalCost', 0] } },
          averagePrice: { $avg: { $ifNull: ['$totalCost', 0] } },
          completedSales: {
            $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { totalSales: -1 }
      },
      {
        $limit: parseInt(limit)
      }
    ];

    const results = await Sale.aggregate(pipeline);
    
    res.json({
      success: true,
      data: {
        period,
        topCourses: results.map(item => ({
          course: item._id || 'Unknown Course',
          totalSales: item.totalSales,
          totalRevenue: Math.round((item.totalRevenue || 0) * 100) / 100,
          averagePrice: Math.round((item.averagePrice || 0) * 100) / 100,
          completedSales: item.completedSales,
          completionRate: Math.round((item.completedSales / item.totalSales) * 100)
        }))
      }
    });
  } catch (error) {
    console.error('Error in top courses report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating top courses report',
      error: error.message
    });
  }
});

router.get('/reports/status-analysis', protect, authorize('Admin', 'Manager'), async (req, res) => {
  try {
    const { period = '1month', status = null } = req.query; // 1month, 3month, 6month, 1year, all
    
    let dateFilter = {};
    const now = new Date();
    
    if (period !== 'all') {
      switch (period) {
        case '1month':
          dateFilter = {
            $gte: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
            $lte: now
          };
          break;
        case '3month':
          dateFilter = {
            $gte: new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()),
            $lte: now
          };
          break;
        case '6month':
          dateFilter = {
            $gte: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
            $lte: now
          };
          break;
        case '1year':
          dateFilter = {
            $gte: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
            $lte: now
          };
          break;
      }
    }

    // Build match stage
    const matchStage = {};
    if (Object.keys(dateFilter).length > 0) {
      matchStage.date = dateFilter;
    }
    if (status) {
      matchStage.status = status;
    }

    // Get status summary
    const statusPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          totalSales: { $sum: 1 },
          totalRevenue: { $sum: '$totalCost' },
          totalTokens: { $sum: '$tokenAmount' },
          averageOrderValue: { $avg: '$totalCost' }
        }
      },
      {
        $sort: { totalSales: -1 }
      }
    ];

    const statusResults = await Sale.aggregate(statusPipeline);

    // Get detailed sales for specific status if requested
    let detailedSales = [];
    if (status) {
      detailedSales = await Sale.find(matchStage)
        .populate('salesPerson', 'fullName email')
        .populate('leadPerson', 'fullName email')
        .select('date customerName country course contactNumber email totalCost tokenAmount pendingAmount status salesPerson leadPerson')
        .sort({ date: -1 })
        .limit(100); // Limit to 100 for performance
    }

    // Get exchange rates for USD conversion
    let exchangeRates = {
      'USD': 1,
      'EUR': 0.85,
      'GBP': 0.73,
      'INR': 83.12,
      'CAD': 1.36,
      'AUD': 1.52,
      'JPY': 149.50,
      'CNY': 7.24
    };
    
    try {
      const ExchangeRate = require('../models/ExchangeRate');
      const exchangeRateDoc = await ExchangeRate.findOne().sort({ updatedAt: -1 });
      if (exchangeRateDoc && exchangeRateDoc.rates) {
        exchangeRates = Object.fromEntries(exchangeRateDoc.rates);
      }
    } catch (err) {
      console.log('Using default exchange rates for status analysis');
    }

    // Process status results with USD conversion
    const processedStatusResults = statusResults.map(item => {
      const currency = 'USD'; // Assuming most sales are in USD, you can modify this logic
      const rate = exchangeRates[currency] || 1;
      
      return {
        status: item._id || 'Unknown',
        totalSales: item.totalSales,
        totalRevenue: Math.round(item.totalRevenue * 100) / 100,
        totalRevenueUSD: Math.round((item.totalRevenue / rate) * 100) / 100,
        totalTokens: Math.round(item.totalTokens * 100) / 100,
        totalTokensUSD: Math.round((item.totalTokens / rate) * 100) / 100,
        pendingAmountUSD: Math.round(((item.totalRevenue - item.totalTokens) / rate) * 100) / 100,
        averageOrderValue: Math.round(item.averageOrderValue * 100) / 100,
        averageOrderValueUSD: Math.round((item.averageOrderValue / rate) * 100) / 100
      };
    });

    res.json({
      success: true,
      data: {
        period,
        selectedStatus: status,
        statusSummary: processedStatusResults,
        detailedSales: detailedSales.map(sale => ({
          _id: sale._id,
          date: sale.date,
          customerName: sale.customerName,
          country: sale.country,
          course: sale.course,
          contactNumber: sale.contactNumber,
          email: sale.email,
          totalCost: sale.totalCost,
          tokenAmount: sale.tokenAmount,
          pendingAmount: sale.pendingAmount,
          status: sale.status,
          salesPerson: sale.salesPerson?.fullName || 'Unknown',
          leadPerson: sale.leadPerson?.fullName || 'Unknown'
        })),
        totalCount: detailedSales.length,
        exchangeRatesUsed: exchangeRates
      }
    });
  } catch (error) {
    console.error('Error in status analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating status analysis report'
    });
  }
});

module.exports = router; 