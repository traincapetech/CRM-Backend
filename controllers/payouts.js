/**
 * Payout Management Controllers
 * Additional endpoints for managing Paytm payouts
 * Migration Note: Migrated from Razorpay to Paytm
 */

const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const paytmService = require('../services/paytmService');
const { getPayoutStatusLabel, formatAmount } = require('../utils/payoutHelpers');

// @desc    Get payout status for a payroll
// @route   GET /api/payouts/payroll/:payrollId
// @access  Private (Admin/HR/Manager)
exports.getPayrollPayoutStatus = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view payout status'
      });
    }

    const payroll = await Payroll.findById(req.params.payrollId).populate('employeeId');
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    // If no payout transaction ID, return status
    // Migration Note: razorpayPayoutId replaced with paytmTransactionId
    if (!payroll.paytmTransactionId) {
      return res.status(200).json({
        success: true,
        data: {
          payrollId: payroll._id,
          employeeName: payroll.employeeId?.fullName,
          payoutStatus: null,
          message: 'No Paytm payout created for this payroll'
        }
      });
    }

    // Fetch latest status from Paytm (replaces Razorpay)
    try {
      const payoutStatus = await paytmService.getPayoutStatus(payroll.paytmTransactionId);
      
      // Update payroll with latest status
      // Migration Note: razorpayPayoutStatus replaced with paytmPayoutStatus
      payroll.paytmPayoutStatus = payoutStatus.status === 'SUCCESS' ? 'SUCCESS' : 
                                   payoutStatus.status === 'FAILED' ? 'FAILED' : 'PENDING';
      await payroll.save();

      res.status(200).json({
        success: true,
        data: {
          payrollId: payroll._id,
          employeeName: payroll.employeeId?.fullName,
          transactionId: payoutStatus.transferId,
          status: payroll.paytmPayoutStatus,
          statusLabel: getPayoutStatusLabel(payroll.paytmPayoutStatus),
          amount: formatAmount(payoutStatus.amount * 100), // Convert rupees to paise for display
          transferMode: payoutStatus.transferMode,
          timestamp: payoutStatus.timestamp
        }
      });
    } catch (paytmError) {
      // If Paytm API fails, return stored status
      console.error('Error fetching payout status from Paytm:', paytmError);
      res.status(200).json({
        success: true,
        data: {
          payrollId: payroll._id,
          employeeName: payroll.employeeId?.fullName,
          transactionId: payroll.paytmTransactionId,
          status: payroll.paytmPayoutStatus,
          statusLabel: getPayoutStatusLabel(payroll.paytmPayoutStatus),
          amount: formatAmount(payroll.netSalary * 100),
          message: 'Using stored status (Paytm API unavailable)'
        }
      });
    }
  } catch (error) {
    console.error('Error getting payout status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get all payouts with status
// @route   GET /api/payouts
// @access  Private (Admin/HR/Manager)
exports.getAllPayouts = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view payouts'
      });
    }

    const { status, month, year } = req.query;

    // Build query
    // Migration Note: razorpayPayoutId replaced with paytmTransactionId
    const query = {
      paytmTransactionId: { $exists: true, $ne: null }
    };

    if (status) {
      query.paytmPayoutStatus = status.toUpperCase();
    }

    if (month) {
      query.month = parseInt(month);
    }

    if (year) {
      query.year = parseInt(year);
    }

    const payouts = await Payroll.find(query)
      .populate('employeeId', 'fullName email')
      .sort('-createdAt')
      .limit(100);

    const payoutData = payouts.map(payroll => ({
      payrollId: payroll._id,
      employeeId: payroll.employeeId?._id,
      employeeName: payroll.employeeId?.fullName,
      employeeEmail: payroll.employeeId?.email,
      month: payroll.month,
      year: payroll.year,
      amount: formatAmount(payroll.netSalary * 100),
      transactionId: payroll.paytmTransactionId,
      status: payroll.paytmPayoutStatus,
      statusLabel: getPayoutStatusLabel(payroll.paytmPayoutStatus),
      paymentMethod: payroll.paymentMethod,
      createdAt: payroll.createdAt,
      paymentDate: payroll.paymentDate
    }));

    res.status(200).json({
      success: true,
      count: payoutData.length,
      data: payoutData
    });
  } catch (error) {
    console.error('Error getting all payouts:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Retry failed payout (manual trigger)
// @route   POST /api/payouts/payroll/:payrollId/retry
// @access  Private (Admin only)
exports.retryPayout = async (req, res) => {
  try {
    // Check authorization - Only Admin can retry payouts
    if (req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Only Admin can retry payouts'
      });
    }

    const payroll = await Payroll.findById(req.params.payrollId).populate('employeeId');
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    // Check if employee has verified payment details
    // Migration Note: paymentVerified and razorpayFundAccountId replaced with paytmVerified and paytmBeneficiaryId
    if (!payroll.employeeId || !payroll.employeeId.paytmVerified || !payroll.employeeId.paytmBeneficiaryId) {
      return res.status(400).json({
        success: false,
        message: 'Employee payment details not verified. Please verify payment details first.'
      });
    }

    // Check if payroll is approved
    if (payroll.status !== 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Payroll must be approved before creating payout'
      });
    }

    // Determine transfer mode
    let transferMode = 'IMPS';
    if (payroll.employeeId.paymentMode === 'upi') {
      transferMode = 'UPI';
    }

    // Create Paytm payout (replaces Razorpay createPayout)
    const payoutData = {
      beneficiaryId: payroll.employeeId.paytmBeneficiaryId,
      amount: payroll.netSalary,
      currency: 'INR',
      transferMode: transferMode,
      purpose: 'salary',
      referenceId: `payroll_${payroll._id}_${payroll.month}_${payroll.year}_retry`,
      remarks: `Salary for ${payroll.employeeId.fullName} - ${payroll.monthName} ${payroll.year} (Retry)`
    };

    const payout = await paytmService.createPayout(payoutData);

    // Update payroll with new payout details (replaces Razorpay fields)
    payroll.paytmTransactionId = payout.transactionId;
    payroll.paytmPayoutStatus = payout.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING';
    payroll.paymentMethod = payroll.employeeId.paymentMode === 'upi' ? 'PAYTM_UPI' : 'PAYTM_BANK';
    payroll.paymentDate = new Date();
    
    await payroll.save();

    res.status(200).json({
      success: true,
      data: {
        payrollId: payroll._id,
        transactionId: payout.transactionId,
        status: payroll.paytmPayoutStatus,
        statusLabel: getPayoutStatusLabel(payroll.paytmPayoutStatus),
        amount: formatAmount(payout.amount * 100),
        message: 'Payout retry initiated successfully'
      }
    });
  } catch (error) {
    console.error('Error retrying payout:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
};
