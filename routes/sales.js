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

// Sales data route for dashboard
router.get('/data', authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get all sales for the current month
    const sales = await Sale.find({
      date: { $gte: startOfMonth, $lte: endOfMonth },
      status: { $ne: 'Cancelled' }
    }).sort({ date: -1 });

    // Calculate stats
    const totalSales = sales.length;
    const monthlyRevenue = sales.reduce((sum, sale) => sum + (sale.totalCost || 0), 0);
    const averageOrderValue = totalSales > 0 ? monthlyRevenue / totalSales : 0;
    const completedSales = sales.filter(sale => sale.status === 'completed').length;
    const conversionRate = totalSales > 0 ? (completedSales / totalSales) * 100 : 0;

    // Get daily sales data for charts
    const dailySales = await Sale.aggregate([
      {
        $match: {
          date: { $gte: startOfMonth, $lte: endOfMonth },
          status: { $ne: 'Cancelled' }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          revenue: { $sum: "$totalCost" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get product sales data
    const productSales = await Sale.aggregate([
      {
        $match: {
          date: { $gte: startOfMonth, $lte: endOfMonth },
          status: { $ne: 'Cancelled' }
        }
      },
      {
        $group: {
          _id: "$course",
          revenue: { $sum: "$totalCost" },
          count: { $sum: 1 }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 4 }
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          totalSales,
          monthlyRevenue,
          averageOrderValue,
          conversionRate
        },
        dailySales: dailySales.map(day => ({
          date: day._id,
          revenue: day.revenue,
          count: day.count
        })),
        productSales: productSales.map(product => ({
          name: product._id || 'Unknown',
          revenue: product.revenue,
          count: product.count
        })),
        recentSales: sales.slice(0, 10).map(sale => ({
          id: sale._id,
          date: sale.date,
          customerName: sale.customerName,
          amount: sale.totalCost,
          status: sale.status,
          email: sale.email
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching sales data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching sales data',
      error: error.message
    });
  }
});

// Import route (Admin only)
router.post('/import', authorize('Admin'), importSales);

// Count route
router.get('/count', authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), getSalesCount);

router.route('/:id')
  .get(authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), getSale)
  .put(authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), updateSale)
  .delete(authorize('Sales Person','Manager', 'Admin'), deleteSale);

// Reports routes
router.get('/reports/course-analysis', protect, authorize('Admin', 'Manager'), async (req, res) => {
  // ... existing code ...
});

router.get('/reports/revenue-analysis', protect, authorize('Admin', 'Manager'), async (req, res) => {
  // ... existing code ...
});

router.get('/reports/top-courses', protect, authorize('Admin', 'Manager'), async (req, res) => {
  // ... existing code ...
});

router.get('/reports/status-analysis', protect, authorize('Admin', 'Manager'), async (req, res) => {
  // ... existing code ...
});

module.exports = router;