const express = require('express');
const router = express.Router();
const {
  createVoucher,
  getVouchers,
  getVoucher,
  updateVoucher,
  deleteVoucher,
  useVoucher,
  getVoucherStats,
  searchVouchers,
  bulkCreateVouchers,
  exportVouchers,
  updatePaymentStatus
} = require('../controllers/vouchers');

const { protect, authorize } = require('../middleware/auth');

// Apply authentication to all routes
router.use(protect);

// Public routes (for authenticated users)
router.route('/')
  .get(getVouchers)
  .post(authorize('Admin', 'Manager', 'Sales Person'), createVoucher);

router.route('/stats')
  .get(getVoucherStats);

router.route('/search')
  .get(searchVouchers);

router.route('/export')
  .get(exportVouchers);

// Admin/Manager only routes
router.route('/bulk')
  .post(authorize('Admin', 'Manager'), bulkCreateVouchers);

// Individual voucher routes
router.route('/:id')
  .get(getVoucher)
  .put(authorize('Admin', 'Manager', 'Sales Person'), updateVoucher)
  .delete(authorize('Admin', 'Manager'), deleteVoucher);

router.route('/:id/use')
  .patch(authorize('Admin', 'Manager', 'Sales Person'), useVoucher);

router.route('/:id/payment-status')
  .patch(authorize('Admin', 'Manager', 'Sales Person'), updatePaymentStatus);

module.exports = router; 