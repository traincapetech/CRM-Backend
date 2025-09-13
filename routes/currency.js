const express = require('express');
const router = express.Router();
const { getRates, refreshRates } = require('../controllers/currency');

// @route   GET /api/currency/rates
// @desc    Get latest exchange rates
// @access  Public
router.get('/rates', getRates);

// @route   POST /api/currency/refresh
// @desc    Force refresh exchange rates (bypass cache)
// @access  Public
router.post('/refresh', refreshRates);

// Get specific exchange rate
router.get('/rate', async (req, res) => {
  try {
    const { from = 'USD', to = 'USD' } = req.query;
    
    // Get current rates from the controller
    const mockReq = {};
    const mockRes = {
      json: (data) => data
    };
    
    const { getRates } = require('../controllers/currency');
    const ratesData = await new Promise((resolve) => {
      const res = {
        json: (data) => resolve(data)
      };
      getRates(mockReq, res);
    });
    
    const rates = ratesData.rates || {};
    const fromRate = rates[from] || 1;
    const toRate = rates[to] || 1;
    const rate = toRate / fromRate;

    res.json({
      success: true,
      data: {
        from,
        to,
        rate: Math.round(rate * 10000) / 10000,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error calculating exchange rate:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating exchange rate'
    });
  }
});

module.exports = router; 