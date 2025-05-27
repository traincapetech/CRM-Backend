const express = require('express');
const router = express.Router();
const {
  getSales,
  getSale,
  createSale,
  updateSale,
  deleteSale,
  getSalesCount
} = require('../controllers/sales');

const { protect, authorize } = require('../middleware/auth');
const Sale = require('../models/Sale');

// All routes below this line require authentication
router.use(protect);

// Routes specific to roles
router.route('/')
  .get(authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), getSales)
  .post(authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), createSale);

// Import route (Admin only) - TODO: Implement importSales function
// router.post('/import', authorize('Admin'), importSales);

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
      .select('date customerName country course countryCode contactNumber email pseudoId salesPerson leadPerson source clientRemark feedback totalCost totalCostCurrency tokenAmount tokenAmountCurrency')
      .populate('salesPerson', 'fullName')
      .populate('leadPerson', 'fullName')
      .sort({ date: -1 });
    
    // Post-process results to ensure currency fields exist
    const processedSales = sales.map(sale => {
      const saleObj = sale.toObject();
      
      // Set default currency values if not present
      if (!saleObj.totalCostCurrency) {
        saleObj.totalCostCurrency = 'USD';
      }
      if (!saleObj.tokenAmountCurrency) {
        saleObj.tokenAmountCurrency = 'USD';
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

module.exports = router; 