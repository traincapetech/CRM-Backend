/**
 * Payout Management Controllers
 * Additional endpoints for managing Paytm payouts
 * Migration Note: Migrated from Razorpay to Paytm
 */

const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const PayoutBatch = require('../models/PayoutBatch');
const PayoutTransaction = require('../models/PayoutTransaction');
const Branch = require('../models/Branch');
const paytmService = require('../services/paytmService');
const { getPayoutStatusLabel, formatAmount } = require('../utils/payoutHelpers');
const PayoutAuditLog = require('../models/PayoutAuditLog');
const { notifyAdmins } = require('../services/notificationService');

// Helper to calculate due date and due status
// Salary for month M is due on 10th of month M+1
const getPeriodDueDate = (month, year) => {
  if (!month || !year) return null;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(Date.UTC(nextYear, nextMonth - 1, 10, 0, 0, 0));
};

const getScheduleInfo = (month, year) => {
  const dueDate = getPeriodDueDate(month, year);
  if (!dueDate) return null;

  const now = new Date();
  const nowMidnight = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0));
  const dueMidnight = new Date(Date.UTC(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(), 0, 0, 0));

  const diffTime = dueMidnight - nowMidnight;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const nextMonthName = month === 12 ? "January" : monthNames[month];
  const dueYear = month === 12 ? year + 1 : year;

  return {
    dueDate,
    dueDateFormatted: `10 ${nextMonthName} ${dueYear}`,
    diffDays,
    isDueToday: diffDays === 0,
    isUpcoming: diffDays > 0,
    isOverdue: diffDays < 0,
    isEarly: diffDays > 0, // Requested before 10th of payout month
    isOldDraft: (now.getFullYear() > dueYear) || (now.getFullYear() === dueYear && (now.getMonth() + 1) > (month === 12 ? 1 : month + 1)),
    statusText: diffDays === 0 
      ? "Due Today (10th)" 
      : diffDays > 0 
        ? `Scheduled for 10 ${nextMonthName} (in ${diffDays} day${diffDays === 1 ? '' : 's'})` 
        : `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`
  };
};

const calculateRecordPayable = (record, component) => {
  const incentives = (parseFloat(record.performanceBonus) || 0) +
                     (parseFloat(record.projectBonus) || 0) +
                     (parseFloat(record.attendanceBonus) || 0) +
                     (parseFloat(record.festivalBonus) || 0);

  const netExclInc = record.netSalaryExceptIncentives != null 
    ? record.netSalaryExceptIncentives 
    : Math.max(0, (record.netSalary || 0) - (parseFloat(record.performanceBonus) || 0) - (parseFloat(record.projectBonus) || 0));

  const totalNet = record.netSalary || 0;

  const salaryPaidAmt = record.salaryPaid?.amount || 0;
  const incentivePaidAmt = record.incentivePaid?.amount || 0;

  if (component === 'SALARY') {
    const target = netExclInc;
    const remaining = Math.max(0, target - salaryPaidAmt);
    return {
      target,
      alreadyPaid: salaryPaidAmt,
      remaining,
      isFullyPaid: remaining <= 0,
    };
  } else if (component === 'INCENTIVE') {
    const target = incentives;
    const remaining = Math.max(0, target - incentivePaidAmt);
    return {
      target,
      alreadyPaid: incentivePaidAmt,
      remaining,
      isFullyPaid: remaining <= 0,
    };
  } else {
    // FULL
    const target = totalNet;
    const alreadyPaid = salaryPaidAmt + incentivePaidAmt;
    const remaining = Math.max(0, target - alreadyPaid);
    return {
      target,
      alreadyPaid,
      remaining,
      isFullyPaid: remaining <= 0,
    };
  }
};

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

      // Phase 6: Audit Log (Status Check)
      await PayoutAuditLog.create({
        payrollId: payroll._id,
        employeeId: payroll.employeeId._id,
        action: 'STATUS_CHECK',
        status: payroll.paytmPayoutStatus,
        amount: payroll.netSalary,
        paytmTransactionId: payroll.paytmTransactionId,
        details: payoutStatus
      });

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

    const { status, month, year, branchId } = req.query;

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

    if (branchId) {
      const branchEmployees = await Employee.find({ branchId }).select('_id');
      const branchEmpIds = branchEmployees.map(e => e._id);
      query.$or = [
        { branchId: branchId },
        { employeeId: { $in: branchEmpIds } }
      ];
    }

    const payouts = await Payroll.find(query)
      .populate({
        path: 'employeeId',
        select: 'fullName email branchId branchLocation',
        populate: { path: 'branchId', select: 'name code city state' }
      })
      .populate('branchId', 'name code city state')
      .sort('-createdAt')
      .limit(100);

    const payoutData = payouts.map(payroll => {
      const branchObj = payroll.branchId || payroll.employeeId?.branchId;
      const branchName = branchObj?.name || payroll.employeeId?.branchLocation || null;

      return {
        payrollId: payroll._id,
        employeeId: payroll.employeeId?._id,
        employeeName: payroll.employeeId?.fullName,
        employeeEmail: payroll.employeeId?.email,
        branchName: branchName,
        month: payroll.month,
        year: payroll.year,
        amount: formatAmount(payroll.netSalary * 100),
        transactionId: payroll.paytmTransactionId,
        status: payroll.paytmPayoutStatus,
        statusLabel: getPayoutStatusLabel(payroll.paytmPayoutStatus),
        paymentMethod: payroll.paymentMethod,
        createdAt: payroll.createdAt,
        paymentDate: payroll.paymentDate
      };
    });

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

    // Phase 6: Audit Log (Retry)
    await PayoutAuditLog.create({
      payrollId: payroll._id,
      employeeId: payroll.employeeId._id,
      action: 'RETRY',
      status: payout.status,
      amount: payroll.netSalary,
      paytmTransactionId: payout.transactionId,
      details: payout,
      performedBy: req.user.id
    });

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

// @desc    Get Paytm account balance
// @route   GET /api/payouts/balance
// @access  Private (Admin only)
exports.getAccountBalance = async (req, res) => {
  try {
    // Check authorization
    if (req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Only Admin can view account balance'
      });
    }

    const paytmService = require('../services/paytmService');
    const balanceData = await paytmService.getAccountBalance();

    res.status(200).json({
      success: true,
      data: balanceData
    });
  } catch (error) {
    console.error('Error getting account balance:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
};
// @desc    Get payout audit logs
// @route   GET /api/payouts/audit-logs/:payrollId?
// @access  Private (Admin/HR/Manager)
exports.getAuditLogs = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view audit logs'
      });
    }

    const { payrollId } = req.params;
    const query = {};

    if (payrollId) {
      query.payrollId = payrollId;
    }

    const logs = await PayoutAuditLog.find(query)
      .populate('employeeId', 'fullName')
      .populate('performedBy', 'fullName')
      .sort('-createdAt')
      .limit(50);

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching audit logs'
    });
  }
};

// ==========================================
// BATCH PAYOUT ENGINE & SCHEDULING
// ==========================================

// @desc    Preview batch payout (Pre-flight dry run & wallet check)
// @route   POST /api/payouts/batch/preview
// @access  Private (Admin/HR/Manager)
exports.previewBatchPayout = async (req, res) => {
  try {
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to preview payout batches'
      });
    }

    const {
      component = 'SALARY', // 'SALARY' | 'INCENTIVE' | 'FULL'
      period = {},
      branchIds = [],
      employeeIds = [],
      method = 'PAYTM'
    } = req.body;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Default to previous month if not provided (e.g. In October, default to September)
    const targetMonth = period.month ? parseInt(period.month) : (currentMonth === 1 ? 12 : currentMonth - 1);
    const targetYear = period.year ? parseInt(period.year) : (currentMonth === 1 && !period.month ? currentYear - 1 : currentYear);
    const targetQuarter = period.quarter ? parseInt(period.quarter) : Math.ceil(targetMonth / 3);

    // Schedule Awareness (Due on 10th of following month)
    const schedule = getScheduleInfo(targetMonth, targetYear);

    // Build payroll query
    const payrollQuery = {
      year: targetYear
    };

    if (component === 'INCENTIVE' && period.quarter) {
      const qMonths = {
        1: [1, 2, 3],
        2: [4, 5, 6],
        3: [7, 8, 9],
        4: [10, 11, 12]
      }[targetQuarter] || [1, 2, 3];
      payrollQuery.month = { $in: qMonths };
    } else {
      payrollQuery.month = targetMonth;
    }

    // Branch filter
    if (branchIds && branchIds.length > 0) {
      const branchEmployees = await Employee.find({ branchId: { $in: branchIds } }).select('_id');
      const branchEmpIds = branchEmployees.map(e => e._id);
      payrollQuery.$or = [
        { branchId: { $in: branchIds } },
        { employeeId: { $in: branchEmpIds } }
      ];
    }

    // Specific employee filter
    if (employeeIds && employeeIds.length > 0) {
      payrollQuery.employeeId = { $in: employeeIds };
    }

    const records = await Payroll.find(payrollQuery)
      .populate({
        path: 'employeeId',
        select: 'fullName email phoneNumber branchId branchLocation paymentMode bankAccountNumber ifscCode accountHolderName upiId paytmBeneficiaryId paytmVerified',
        populate: { path: 'branchId', select: 'name code city state' }
      })
      .populate('branchId', 'name code city state');

    // Fetch live Paytm wallet balance if method is PAYTM
    let walletBalance = null;
    let walletError = null;
    if (method === 'PAYTM') {
      try {
        const balData = await paytmService.getAccountBalance();
        walletBalance = balData.balance || 0;
      } catch (err) {
        walletError = err.message || 'Unable to fetch wallet balance';
        console.warn('Paytm balance check warning in preview:', walletError);
      }
    }

    const ready = [];
    const missingBankDetails = [];
    const pendingApproval = [];
    const alreadyPaid = [];

    let totalEligibleAmount = 0;

    records.forEach(rec => {
      const payable = calculateRecordPayable(rec, component);
      const emp = rec.employeeId;
      const branchObj = rec.branchId || emp?.branchId;
      const branchName = branchObj?.name || emp?.branchLocation || 'Main Branch';

      const employeeInfo = {
        payrollId: rec._id,
        employeeId: emp?._id,
        fullName: rec.isCustomPayee ? rec.customPayeeName : (emp?.fullName || 'Unknown'),
        email: emp?.email,
        branchId: branchObj?._id,
        branchName: branchName,
        month: rec.month,
        year: rec.year,
        status: rec.status,
        netSalary: rec.netSalary,
        targetAmount: payable.target,
        alreadyPaid: payable.alreadyPaid,
        payableAmount: payable.remaining,
        paymentMode: emp?.paymentMode || (emp?.upiId ? 'upi' : 'bank'),
        hasBeneficiary: !!emp?.paytmBeneficiaryId,
        isPaytmVerified: !!emp?.paytmVerified,
        accountMasked: emp?.bankAccountNumber ? `****${emp.bankAccountNumber.slice(-4)}` : null,
        upiId: emp?.upiId || null
      };

      if (payable.remaining <= 0) {
        alreadyPaid.push(employeeInfo);
        return;
      }

      if (rec.status !== 'APPROVED') {
        pendingApproval.push(employeeInfo);
        return;
      }

      // Check payment details for PAYTM method
      const isBankReady = (emp?.paymentMode === 'bank' || !emp?.paymentMode) && !!emp?.bankAccountNumber && !!emp?.ifscCode;
      const isUpiReady = emp?.paymentMode === 'upi' && !!emp?.upiId;
      const hasPaymentDetails = method === 'OFFLINE' || isBankReady || isUpiReady || (emp?.paytmVerified && emp?.paytmBeneficiaryId);

      if (method === 'PAYTM' && !hasPaymentDetails) {
        missingBankDetails.push({
          ...employeeInfo,
          issue: 'Missing bank account & IFSC or UPI ID'
        });
      } else {
        ready.push(employeeInfo);
        totalEligibleAmount += payable.remaining;
      }
    });

    const isBalanceSufficient = walletBalance != null ? walletBalance >= totalEligibleAmount : null;
    const shortfall = (walletBalance != null && !isBalanceSufficient) 
      ? Math.max(0, totalEligibleAmount - walletBalance) 
      : 0;

    res.status(200).json({
      success: true,
      data: {
        component,
        method,
        period: {
          month: targetMonth,
          year: targetYear,
          quarter: targetQuarter,
          label: component === 'INCENTIVE' 
            ? `Q${targetQuarter} ${targetYear}` 
            : `${recMonthName(targetMonth)} ${targetYear}`
        },
        schedule,
        wallet: {
          balance: walletBalance,
          isSufficient: isBalanceSufficient,
          shortfall,
          error: walletError
        },
        summary: {
          totalRecords: records.length,
          readyCount: ready.length,
          totalPayableAmount: totalEligibleAmount,
          missingBankDetailsCount: missingBankDetails.length,
          pendingApprovalCount: pendingApproval.length,
          alreadyPaidCount: alreadyPaid.length,
        },
        ready,
        missingBankDetails,
        pendingApproval,
        alreadyPaid
      }
    });
  } catch (error) {
    console.error('Batch payout preview error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during batch payout preview'
    });
  }
};

// Helper for month name
function recMonthName(m) {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return months[m - 1] || `Month ${m}`;
}

// @desc    Execute batch payout (Batch disbursement with idempotency & safety guards)
// @route   POST /api/payouts/batch/run
// @access  Private (Admin only)
exports.executeBatchPayout = async (req, res) => {
  try {
    // Only Admin can execute real payouts
    if (req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Only Admin can execute payout disbursements'
      });
    }

    const {
      component = 'SALARY',
      period = {},
      branchIds = [],
      employeeIds = [],
      method = 'PAYTM',
      notes = '',
      allowEarlyPayout = false
    } = req.body;

    const targetMonth = parseInt(period.month);
    const targetYear = parseInt(period.year);
    const targetQuarter = period.quarter ? parseInt(period.quarter) : Math.ceil(targetMonth / 3);

    if (!targetYear || (!targetMonth && component !== 'INCENTIVE')) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required for payout execution'
      });
    }

    // Schedule Check: Ensure we don't accidentally pay before 10th without confirmation
    const schedule = getScheduleInfo(targetMonth, targetYear);
    if (schedule && schedule.isEarly && !allowEarlyPayout) {
      return res.status(400).json({
        success: false,
        requiresEarlyConfirmation: true,
        message: `${recMonthName(targetMonth)} ${targetYear} salary is due on ${schedule.dueDateFormatted}. Please check 'Allow Early Payout' if you wish to disburse before the 10th.`
      });
    }

    // Build payroll query
    const payrollQuery = {
      year: targetYear,
      status: 'APPROVED' // ONLY APPROVED RECORDS CAN BE PAID!
    };

    if (component === 'INCENTIVE' && period.quarter) {
      const qMonths = {
        1: [1, 2, 3],
        2: [4, 5, 6],
        3: [7, 8, 9],
        4: [10, 11, 12]
      }[targetQuarter] || [1, 2, 3];
      payrollQuery.month = { $in: qMonths };
    } else {
      payrollQuery.month = targetMonth;
    }

    if (branchIds && branchIds.length > 0) {
      const branchEmployees = await Employee.find({ branchId: { $in: branchIds } }).select('_id');
      const branchEmpIds = branchEmployees.map(e => e._id);
      payrollQuery.$or = [
        { branchId: { $in: branchIds } },
        { employeeId: { $in: branchEmpIds } }
      ];
    }

    if (employeeIds && employeeIds.length > 0) {
      payrollQuery.employeeId = { $in: employeeIds };
    }

    const records = await Payroll.find(payrollQuery)
      .populate({
        path: 'employeeId',
        select: 'fullName email phoneNumber branchId branchLocation paymentMode bankAccountNumber ifscCode accountHolderName upiId paytmBeneficiaryId paytmVerified'
      })
      .populate('branchId', 'name code');

    // Filter to those with unpaid balance
    const payableRecords = [];
    let totalRequiredAmount = 0;

    for (const rec of records) {
      const payable = calculateRecordPayable(rec, component);
      if (payable.remaining > 0) {
        // For PAYTM method, must have beneficiary details or bank/UPI details to auto-register
        if (method === 'PAYTM') {
          const emp = rec.employeeId;
          const isBankReady = (emp?.paymentMode === 'bank' || !emp?.paymentMode) && !!emp?.bankAccountNumber && !!emp?.ifscCode;
          const isUpiReady = emp?.paymentMode === 'upi' && !!emp?.upiId;
          const hasDetails = emp?.paytmBeneficiaryId || isBankReady || isUpiReady;
          if (!hasDetails) {
            continue; // Skip employees with no bank/UPI details
          }
        }
        payableRecords.push({ record: rec, payableAmount: payable.remaining });
        totalRequiredAmount += payable.remaining;
      }
    }

    if (payableRecords.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No eligible approved payroll records found for disbursement in the selected period'
      });
    }

    // HARD WALLET BALANCE CHECK: Pre-flight check against Paytm wallet
    let walletBalanceAtStart = null;
    if (method === 'PAYTM') {
      try {
        const balData = await paytmService.getAccountBalance();
        walletBalanceAtStart = balData.balance || 0;

        if (walletBalanceAtStart < totalRequiredAmount) {
          const shortfall = totalRequiredAmount - walletBalanceAtStart;
          return res.status(400).json({
            success: false,
            message: `Insufficient Paytm wallet balance. Required: ₹${totalRequiredAmount.toLocaleString('en-IN')}, Available: ₹${walletBalanceAtStart.toLocaleString('en-IN')}. Shortfall: ₹${shortfall.toLocaleString('en-IN')}. Please add funds to your Paytm wallet before executing.`,
            shortfall,
            walletBalance: walletBalanceAtStart,
            totalRequiredAmount
          });
        }
      } catch (balError) {
        console.error('Wallet balance verification failed:', balError);
        return res.status(500).json({
          success: false,
          message: `Could not verify Paytm wallet balance: ${balError.message}. Payout aborted to prevent failures.`
        });
      }
    }

    // Create PayoutBatch document
    const batch = await PayoutBatch.create({
      component,
      method,
      period: {
        month: targetMonth,
        quarter: targetQuarter,
        year: targetYear
      },
      branchIds: branchIds || [],
      employeeIds: employeeIds || [],
      totalCount: payableRecords.length,
      totalAmount: totalRequiredAmount,
      status: 'PROCESSING',
      walletBalanceAtStart,
      environment: process.env.PAYTM_ENV || 'staging',
      notes,
      createdBy: req.user.id,
      startedAt: new Date()
    });

    const periodLabel = component === 'INCENTIVE' 
      ? `Q${targetQuarter} ${targetYear}` 
      : `${recMonthName(targetMonth)} ${targetYear}`;

    let successCount = 0;
    let failedCount = 0;
    let successAmount = 0;
    const transactions = [];

    // Process each record sequentially to avoid rate-limits or concurrency issues
    for (const item of payableRecords) {
      const { record, payableAmount } = item;
      const emp = record.employeeId;

      // Unique idempotent transfer ID
      const transferId = `TXN_${batch._id.toString().slice(-6)}_${record._id.toString().slice(-6)}_${Date.now()}`;

      const transferMode = emp.paymentMode === 'upi' ? 'UPI' : 'IMPS';

      // Record transaction
      const txn = new PayoutTransaction({
        batchId: batch._id,
        employeeId: emp._id,
        branchId: record.branchId?._id || emp.branchId,
        component,
        method,
        amount: payableAmount,
        allocations: [{
          payrollId: record._id,
          component: component === 'FULL' ? 'SALARY' : component,
          amount: payableAmount
        }],
        period: {
          month: record.month,
          quarter: targetQuarter,
          year: record.year
        },
        periodLabel,
        transferId,
        transferMode: method === 'PAYTM' ? transferMode : null,
        status: 'INITIATED',
        initiatedBy: req.user.id
      });

      if (method === 'PAYTM') {
        try {
          // If employee does not have a Paytm beneficiary registered yet, create it now
          if (!emp.paytmBeneficiaryId) {
            const isUpi = emp.paymentMode === 'upi' && !!emp.upiId;
            const decAcc = emp.getDecryptedBankAccount ? emp.getDecryptedBankAccount() : emp.bankAccountNumber;
            const benData = {
              beneficiaryId: `BEN_${emp._id.toString()}`,
              name: emp.fullName,
              email: emp.email || 'accounts@traincapetech.in',
              mobile: emp.phoneNumber || '9999999999',
              paymentMode: isUpi ? 'upi' : 'bank'
            };

            if (isUpi) {
              benData.upiId = emp.upiId;
            } else {
              benData.bankDetails = {
                accountNumber: decAcc,
                ifsc: emp.ifscCode,
                accountHolderName: emp.accountHolderName || emp.fullName
              };
            }

            const benRes = await paytmService.createBeneficiary(benData);
            emp.paytmBeneficiaryId = benRes.beneficiaryId || benData.beneficiaryId;
            emp.paytmVerified = true;
            await emp.save();
          }

          const payoutPayload = {
            beneficiaryId: emp.paytmBeneficiaryId,
            amount: payableAmount,
            currency: 'INR',
            transferMode: transferMode,
            purpose: component === 'INCENTIVE' ? 'bonus' : 'salary',
            referenceId: transferId,
            remarks: `${component} payout - ${emp.fullName} (${periodLabel})`
          };

          const paytmResult = await paytmService.createPayout(payoutPayload);

          txn.status = paytmResult.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING';
          txn.paidAt = new Date();
          txn.settled = true;
          txn.paytmResponse = paytmResult;
          await txn.save();

          // Apply to Payroll record
          if (component === 'SALARY') {
            record.salaryPaid = {
              amount: (record.salaryPaid?.amount || 0) + payableAmount,
              paidAt: new Date(),
              method: 'PAYTM'
            };
          } else if (component === 'INCENTIVE') {
            record.incentivePaid = {
              amount: (record.incentivePaid?.amount || 0) + payableAmount,
              paidAt: new Date(),
              method: 'PAYTM'
            };
          } else {
            // FULL
            record.salaryPaid = {
              amount: record.netSalaryExceptIncentives || (record.netSalary - (record.performanceBonus || 0) - (record.projectBonus || 0)),
              paidAt: new Date(),
              method: 'PAYTM'
            };
            record.incentivePaid = {
              amount: (record.performanceBonus || 0) + (record.projectBonus || 0) + (record.attendanceBonus || 0) + (record.festivalBonus || 0),
              paidAt: new Date(),
              method: 'PAYTM'
            };
          }

          const totalPaidNow = (record.salaryPaid?.amount || 0) + (record.incentivePaid?.amount || 0);
          if (totalPaidNow >= (record.netSalary || 0)) {
            record.status = 'PAID';
          }

          record.paymentDate = new Date();
          record.paymentMethod = emp.paymentMode === 'upi' ? 'PAYTM_UPI' : 'PAYTM_BANK';
          record.paytmTransactionId = paytmResult.transactionId || transferId;
          record.paytmPayoutStatus = paytmResult.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING';

          record.auditLogs.push({
            message: `Batch Payout (${component}) dispatched via Paytm: ₹${payableAmount}. Transfer ID: ${transferId}`,
            changedBy: req.user.id,
            timestamp: new Date()
          });

          await record.save();

          successCount++;
          successAmount += payableAmount;
          transactions.push(txn);
        } catch (paytmErr) {
          console.error(`Paytm payout failed for employee ${emp._id}:`, paytmErr.message);
          txn.status = 'FAILED';
          txn.failureReason = paytmErr.message || 'Paytm API error';
          await txn.save();

          failedCount++;
          transactions.push(txn);
        }
      } else {
        // OFFLINE Method (Bank/Cash/Cheque manual payment recorded)
        txn.status = 'SUCCESS';
        txn.settled = true;
        txn.paidAt = new Date();
        await txn.save();

        if (component === 'SALARY') {
          record.salaryPaid = {
            amount: (record.salaryPaid?.amount || 0) + payableAmount,
            paidAt: new Date(),
            method: 'OFFLINE'
          };
        } else if (component === 'INCENTIVE') {
          record.incentivePaid = {
            amount: (record.incentivePaid?.amount || 0) + payableAmount,
            paidAt: new Date(),
            method: 'OFFLINE'
          };
        } else {
          record.salaryPaid = {
            amount: record.netSalaryExceptIncentives || (record.netSalary - (record.performanceBonus || 0) - (record.projectBonus || 0)),
            paidAt: new Date(),
            method: 'OFFLINE'
          };
          record.incentivePaid = {
            amount: (record.performanceBonus || 0) + (record.projectBonus || 0) + (record.attendanceBonus || 0) + (record.festivalBonus || 0),
            paidAt: new Date(),
            method: 'OFFLINE'
          };
        }

        const totalPaidNow = (record.salaryPaid?.amount || 0) + (record.incentivePaid?.amount || 0);
        if (totalPaidNow >= (record.netSalary || 0)) {
          record.status = 'PAID';
        }

        record.paymentDate = new Date();
        record.paymentMethod = 'BANK_TRANSFER';

        record.auditLogs.push({
          message: `Batch Payout (${component}) recorded OFFLINE: ₹${payableAmount}`,
          changedBy: req.user.id,
          timestamp: new Date()
        });

        await record.save();

        successCount++;
        successAmount += payableAmount;
        transactions.push(txn);
      }
    }

    // Update batch status
    batch.successCount = successCount;
    batch.failedCount = failedCount;
    batch.successAmount = successAmount;
    batch.completedAt = new Date();
    batch.status = failedCount === 0 ? 'COMPLETED' : (successCount > 0 ? 'PARTIAL' : 'FAILED');
    await batch.save();

    // Audit Log for batch
    await PayoutAuditLog.create({
      payrollId: payableRecords[0]?.record?._id,
      employeeId: payableRecords[0]?.record?.employeeId?._id,
      action: 'BATCH_RUN',
      status: batch.status,
      amount: successAmount,
      details: {
        batchId: batch._id,
        component,
        method,
        period: batch.period,
        totalCount: batch.totalCount,
        successCount,
        failedCount,
        notes
      },
      performedBy: req.user.id
    });

    // Notify admins
    await notifyAdmins({
      type: 'PAYOUT_BATCH_COMPLETED',
      message: `Payout Batch Completed: ${component} (${periodLabel}) — ${successCount}/${payableRecords.length} disbursed (₹${successAmount.toLocaleString('en-IN')}) by ${req.user.fullName}. Status: ${batch.status}.`,
      batchId: batch._id
    });

    res.status(200).json({
      success: true,
      message: `Payout batch executed: ${successCount} successful, ${failedCount} failed`,
      data: {
        batchId: batch._id,
        status: batch.status,
        component: batch.component,
        method: batch.method,
        period: batch.period,
        periodLabel,
        totalCount: batch.totalCount,
        successCount,
        failedCount,
        totalAmount: batch.totalAmount,
        successAmount,
        transactions
      }
    });
  } catch (error) {
    console.error('Execute batch payout error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during batch payout execution'
    });
  }
};

// @desc    Get all payout batches
// @route   GET /api/payouts/batches
// @access  Private (Admin/HR/Manager)
exports.getBatchHistory = async (req, res) => {
  try {
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view payout batches'
      });
    }

    const { status, component, year, month, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status) query.status = status;
    if (component) query.component = component;
    if (year) query['period.year'] = parseInt(year);
    if (month) query['period.month'] = parseInt(month);

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const batches = await PayoutBatch.find(query)
      .populate('createdBy', 'fullName email')
      .populate('branchIds', 'name code')
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PayoutBatch.countDocuments(query);

    res.status(200).json({
      success: true,
      data: batches,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get batch history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get batch details with all transactions
// @route   GET /api/payouts/batches/:batchId
// @access  Private (Admin/HR/Manager)
exports.getBatchDetails = async (req, res) => {
  try {
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view batch details'
      });
    }

    const batch = await PayoutBatch.findById(req.params.batchId)
      .populate('createdBy', 'fullName email')
      .populate('branchIds', 'name code city state');

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Payout batch not found'
      });
    }

    const transactions = await PayoutTransaction.find({ batchId: batch._id })
      .populate({
        path: 'employeeId',
        select: 'fullName email phoneNumber branchId',
        populate: { path: 'branchId', select: 'name code' }
      })
      .populate('branchId', 'name code')
      .sort('status');

    res.status(200).json({
      success: true,
      data: {
        batch,
        transactions
      }
    });
  } catch (error) {
    console.error('Get batch details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get schedule & due status overview
// @route   GET /api/payouts/schedule-status
// @access  Private (Admin/HR/Manager)
exports.getScheduleStatus = async (req, res) => {
  try {
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // The salary currently due is for previous month (e.g. In October, September salary is due)
    const dueMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const dueYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    const schedule = getScheduleInfo(dueMonth, dueYear);

    // Count approved records for that due month with unpaid salary
    const pendingPayrolls = await Payroll.find({
      month: dueMonth,
      year: dueYear,
      status: 'APPROVED'
    }).populate('employeeId', 'fullName');

    let pendingCount = 0;
    let pendingAmount = 0;

    pendingPayrolls.forEach(rec => {
      const payable = calculateRecordPayable(rec, 'SALARY');
      if (payable.remaining > 0) {
        pendingCount++;
        pendingAmount += payable.remaining;
      }
    });

    // Check for older overdue unpaid payrolls
    const overduePayrolls = await Payroll.find({
      status: 'APPROVED',
      $or: [
        { year: { $lt: dueYear } },
        { year: dueYear, month: { $lt: dueMonth } }
      ]
    });

    let overdueCount = 0;
    let overdueAmount = 0;
    overduePayrolls.forEach(rec => {
      const payable = calculateRecordPayable(rec, 'SALARY');
      if (payable.remaining > 0) {
        overdueCount++;
        overdueAmount += payable.remaining;
      }
    });

    // Check wallet balance
    let wallet = { balance: 0, available: false };
    try {
      const balData = await paytmService.getAccountBalance();
      wallet = { balance: balData.balance || 0, available: true };
    } catch {
      wallet = { balance: null, available: false };
    }

    res.status(200).json({
      success: true,
      data: {
        today: now.toISOString(),
        salaryCycle: {
          month: dueMonth,
          monthName: recMonthName(dueMonth),
          year: dueYear,
          label: `${recMonthName(dueMonth)} ${dueYear} Salary`
        },
        schedule,
        pendingCurrentMonth: {
          count: pendingCount,
          amount: pendingAmount
        },
        overduePreviousMonths: {
          count: overdueCount,
          amount: overdueAmount
        },
        wallet
      }
    });
  } catch (error) {
    console.error('Get schedule status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
