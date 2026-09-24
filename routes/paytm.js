/**
 * Paytm Payout Callback Routes
 * Handles Paytm payout status callbacks/webhooks
 * Migration Note: Replaces Razorpay webhook handlers
 */

const express = require('express');
const router = express.Router();
const Payroll = require('../models/Payroll');
const paytmService = require('../services/paytmService');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');
const PayoutAuditLog = require('../models/PayoutAuditLog');

// @desc    Handle Paytm payout status callback
// @route   POST /api/paytm/callback
// @access  Public (Paytm webhook)
router.post('/callback', async (req, res) => {
  try {
    const callbackData = req.body;
    
    // Process Paytm callback (replaces Razorpay webhook)
    // BUG FIX: Added await to handlePayoutCallback
    const processedData = await paytmService.handlePayoutCallback(callbackData);
    
    // Find payroll by transaction ID and populate employee
    const payroll = await Payroll.findOne({ 
      paytmTransactionId: processedData.transferId 
    }).populate('employeeId');
    
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
      
      // Phase 6: Audit Log (Webhook)
      await PayoutAuditLog.create({
        payrollId: payroll._id,
        employeeId: payroll.employeeId?._id,
        action: processedData.status === 'SUCCESS' ? 'WEBHOOK_SUCCESS' : 'WEBHOOK_FAILED',
        status: processedData.status,
        amount: payroll.netSalary,
        paytmTransactionId: processedData.transferId,
        details: processedData
      });
      
      // Phase 5: Send Email Notifications
      if (payroll.employeeId && (payroll.paytmPayoutStatus === 'SUCCESS' || payroll.paytmPayoutStatus === 'FAILED')) {
        try {
          // Send Email
          await emailService.sendSalaryPayoutEmail(payroll.employeeId, payroll);
          
          // Also create an in-app notification
          if (notificationService && notificationService.createNotification) {
            await notificationService.createNotification({
              recipient: payroll.employeeId._id,
              sender: null, // System notification
              type: 'SALARY_PAYOUT',
              title: `Salary Payout ${payroll.paytmPayoutStatus === 'SUCCESS' ? 'Successful' : 'Failed'}`,
              message: `Your salary for ${payroll.monthName} ${payroll.year} has been ${payroll.paytmPayoutStatus === 'SUCCESS' ? 'successfully processed' : 'failed'}.`,
              link: '/salary-advances' // Or appropriate link
            });
          }
        } catch (emailError) {
          console.error('Error sending payout notification:', emailError);
        }
      }
      
      console.log(`✅ Paytm payout status updated for payroll ${payroll._id}: ${processedData.status}`);
    } else {
      console.warn(`⚠️ Paytm webhook received unknown transferId: ${processedData.transferId}`);
    }
    
    // Return success response to Paytm
    res.status(200).json({ status: 'SUCCESS' });
  } catch (error) {
    console.error('Error handling Paytm callback:', error);
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

module.exports = router;
