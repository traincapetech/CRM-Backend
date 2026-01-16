/**
 * Paytm Payout Callback Routes
 * Handles Paytm payout status callbacks/webhooks
 * Migration Note: Replaces Razorpay webhook handlers
 */

const express = require('express');
const router = express.Router();
const Payroll = require('../models/Payroll');
const paytmService = require('../services/paytmService');

// @desc    Handle Paytm payout status callback
// @route   POST /api/paytm/callback
// @access  Public (Paytm webhook)
router.post('/callback', async (req, res) => {
  try {
    const callbackData = req.body;
    
    // Process Paytm callback (replaces Razorpay webhook)
    const processedData = paytmService.handlePayoutCallback(callbackData);
    
    // Find payroll by transaction ID
    const payroll = await Payroll.findOne({ 
      paytmTransactionId: processedData.transferId 
    });
    
    if (payroll) {
      // Update payroll status based on Paytm callback
      // Migration Note: razorpayPayoutStatus replaced with paytmPayoutStatus
      if (processedData.status === 'SUCCESS') {
        payroll.paytmPayoutStatus = 'SUCCESS';
        payroll.status = 'PAID';
      } else if (processedData.status === 'FAILED') {
        payroll.paytmPayoutStatus = 'FAILED';
      } else {
        payroll.paytmPayoutStatus = 'PENDING';
      }
      
      await payroll.save();
      
      console.log(`✅ Paytm payout status updated for payroll ${payroll._id}: ${processedData.status}`);
    }
    
    // Return success response to Paytm
    res.status(200).json({ status: 'SUCCESS' });
  } catch (error) {
    console.error('Error handling Paytm callback:', error);
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

module.exports = router;
