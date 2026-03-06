const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getPayrollPayoutStatus,
  getAllPayouts,
  retryPayout,
  getAccountBalance,
  getAuditLogs
} = require('../controllers/payouts');

// All payout routes require authentication
router.use(protect);

// Get payout status for a specific payroll
router.get('/payroll/:payrollId', getPayrollPayoutStatus);

// Get all payouts with optional filters
router.get('/', getAllPayouts);

// Retry a failed payout (Admin only)
router.post('/payroll/:payrollId/retry', retryPayout);

// Get account balance (Admin only)
router.get('/balance', getAccountBalance);

// Get audit logs (Admin/HR/Manager)
router.get('/audit-logs/:payrollId?', getAuditLogs);

module.exports = router;
