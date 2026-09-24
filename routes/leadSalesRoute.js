const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect, authorize } = require('../middleware/auth');
const Sale = require('../models/Sale');

// All routes below this line require authentication
router.use(protect);

// @route   GET /api/lead-sales
// @desc    Get sales sheet data for lead persons
// @access  Private (Lead Person, Manager, Admin)
router.get('/', authorize('Lead Person', 'Manager', 'Admin'), async (req, res) => {
  try {
    console.log('============= LEAD SALES REQUEST =============');
    console.log('User making request:', {
      id: req.user.id,
      _id: req.user._id ? req.user._id.toString() : 'undefined',
      role: req.user.role,
      name: req.user.fullName
    });
    
    let salesQuery = {};
    
    if (req.user.role === 'Lead Person') {
      const leadPersonId = req.user._id.toString();
      const leadPersonName = req.user.fullName;
      console.log('Filtering for lead person ID:', leadPersonId);
      console.log('Filtering for lead person name:', leadPersonName);
      
      // Find sales where:
      // 1. This person is assigned as leadPerson (by ID)
      // 2. This person's name appears in the leadBy field (case-insensitive, can be partial match)
      // This ensures all sales related to this lead person are shown
      // Escape special regex characters in the name
      const escapedName = leadPersonName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      salesQuery = {
        $or: [
          { isLeadPersonSale: true, leadPerson: new mongoose.Types.ObjectId(leadPersonId) },
          { leadPerson: new mongoose.Types.ObjectId(leadPersonId) },
          { leadBy: { $regex: new RegExp(escapedName, 'i') } } // Case-insensitive match (can be partial)
        ]
      };
    } else {
      // For Manager and Admin, show all lead-related sales
      // Include sales with leadPerson OR leadBy field populated
      salesQuery = {
        $or: [
          { isLeadPersonSale: true },
          { leadPerson: { $exists: true, $ne: null } },
          { leadBy: { $exists: true, $ne: null, $ne: '' } }
        ]
      };
    }
    
    console.log('Sales query:', JSON.stringify(salesQuery));
    
    // Get sales based on the query
    const allSales = await Sale.find(salesQuery)
      .select('date customerName country course countryCode contactNumber email pseudoId salesPerson leadPerson leadBy source clientRemark feedback totalCost totalCostCurrency tokenAmount tokenAmountCurrency isLeadPersonSale')
      .populate('salesPerson', 'fullName')
      .populate('leadPerson', 'fullName')
      .sort({ date: -1 });
    
    console.log(`Found ${allSales.length} total sales records`);
    
    // Process the sales data
    const processedSales = allSales.map(sale => {
      const saleObj = sale.toObject();
      
      // Set default currency values if not present
      if (!saleObj.totalCostCurrency) {
        saleObj.totalCostCurrency = 'USD';
      }
      if (!saleObj.tokenAmountCurrency) {
        saleObj.tokenAmountCurrency = 'USD';
      }
      
      // Add a type field to distinguish between lead person sales and regular sales
      saleObj.saleType = saleObj.isLeadPersonSale ? 'Lead Person Sale' : 'Sales Person Sale';
      
      return saleObj;
    });
    
    console.log('============= LEAD SALES RESPONSE =============');
    console.log(`Returning ${processedSales.length} sales records`);
    
    res.status(200).json({
      success: true,
      count: processedSales.length,
      data: processedSales
    });
  } catch (err) {
    console.error('Error in lead sales route:', err);
    console.error('Stack trace:', err.stack);
    
    res.status(500).json({
      success: false,
      message: 'Server error while fetching sales data',
      error: err.message
    });
  }
});

module.exports = router; 