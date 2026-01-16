const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  generatePayroll,
  getPayroll,
  updatePayroll,
  deletePayroll,
  generateSalarySlip,
  downloadSalarySlip,
  approvePayroll
} = require('../controllers/payroll');

// Debug middleware
const debugMiddleware = (req, res, next) => {
  console.log('Payroll route accessed:', {
    method: req.method,
    path: req.path,
    user: req.user ? {
      id: req.user.id,
      role: req.user.role
    } : 'Not authenticated',
    query: req.query,
    params: req.params
  });
  next();
};

// Apply debug middleware to all routes
router.use(debugMiddleware);

// Get payroll records and download salary slip - accessible to all authenticated users
router.route('/')
  .get(protect, getPayroll);

router.route('/:id/salary-slip')
  .get(protect, generateSalarySlip);

router.route('/:id/download')
  .get(protect, downloadSalarySlip);

// Admin/HR/Manager only routes
router.route('/generate')
  .post(protect, generatePayroll);

router.route('/:id')
  .put(protect, updatePayroll)
  .delete(protect, deletePayroll);

router.route('/:id/approve')
  .put(protect, approvePayroll);

module.exports = router; 