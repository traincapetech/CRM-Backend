const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getLeaves,
  getMyLeaves,
  createLeave,
  updateLeave,
  deleteLeave,
  getLeaveBalance,
  approveLeave,
  rejectLeave
} = require('../controllers/leaves');

// Debug middleware
const debugMiddleware = (req, res, next) => {
  console.log('Leave route accessed:', {
    method: req.method,
    path: req.path,
    user: req.user ? {
      id: req.user.id,
      role: req.user.role
    } : 'Not authenticated'
  });
  next();
};

// Apply debug middleware to all routes
router.use(debugMiddleware);

// Employee routes
router.route('/my-leaves')
  .get(protect, getMyLeaves);

router.route('/balance')
  .get(protect, getLeaveBalance);

router.route('/')
  .post(protect, createLeave)
  .get(protect, getLeaves);

// Admin/HR/Manager routes
router.route('/:id')
  .put(protect, updateLeave)
  .delete(protect, deleteLeave);

router.route('/:id/approve')
  .put(protect, approveLeave);

router.route('/:id/reject')
  .put(protect, rejectLeave);

module.exports = router; 