const express = require('express');
const router = express.Router();
const {
  applyLeave,
  getAllLeaves,
  getMyLeaves,
  updateLeaveStatus,
  cancelLeave,
  getLeaveStats,
  getLeaveBalance
} = require('../controllers/leaves');
const { protect, authorize } = require('../middleware/auth');

// Apply for leave
router.post('/', protect, applyLeave);

// Get my leaves
router.get('/my-leaves', protect, getMyLeaves);

// Get leave balance
router.get('/balance', protect, getLeaveBalance);

// Get leave statistics
router.get('/stats', protect, getLeaveStats);

// Get all leaves (for managers/admins)
router.get('/', protect, authorize('Admin', 'Manager'), getAllLeaves);

// Update leave status (approve/reject)
router.put('/:id/status', protect, authorize('Admin', 'Manager'), updateLeaveStatus);

// Cancel leave
router.put('/:id/cancel', protect, cancelLeave);

module.exports = router; 