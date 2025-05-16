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
    
    // Simple approach - get all sales data first
    const allSales = await Sale.find({})
      .select('date customerName country course countryCode contactNumber email pseudoId salesPerson leadPerson source clientRemark feedback totalCost totalCostCurrency tokenAmount tokenAmountCurrency')
      .populate('salesPerson', 'fullName')
      .populate('leadPerson', 'fullName')
      .sort({ date: -1 });
    
    console.log(`Found ${allSales.length} total sales records`);
    
    // Filter in memory if the user is a Lead Person
    let filteredSales = allSales;
    
    if (req.user.role === 'Lead Person') {
      const leadPersonId = req.user._id.toString();
      console.log('Filtering for lead person:', leadPersonId);
      
      filteredSales = allSales.filter(sale => {
        // Check if leadPerson exists and matches user ID
        if (!sale.leadPerson) return false;
        
        const saleLeadPersonId = sale.leadPerson._id ? 
          sale.leadPerson._id.toString() : 
          (typeof sale.leadPerson === 'string' ? sale.leadPerson : null);
        
        return saleLeadPersonId === leadPersonId;
      });
      
      console.log(`Filtered to ${filteredSales.length} sales for this lead person`);
    }
    
    // Process the sales data
    const processedSales = filteredSales.map(sale => {
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