const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getPayrollPayoutStatus,
  getAllPayouts,
  retryPayout
} = require('../controllers/payouts');

// All payout routes require authentication
router.use(protect);

// Get payout status for a specific payroll
router.get('/payroll/:payrollId', getPayrollPayoutStatus);

// Get all payouts with optional filters
router.get('/', getAllPayouts);

// Retry a failed payout (Admin only)
router.post('/payroll/:payrollId/retry', retryPayout);

module.exports = router;
