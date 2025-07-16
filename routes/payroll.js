const express = require('express');
const {
  generatePayroll,
  getPayroll,
  updatePayroll,
  deletePayroll,
  generateSalarySlip,
  downloadSalarySlip,
  approvePayroll
} = require('../controllers/payroll');

const router = express.Router();
const { protect } = require('../middleware/auth');

// Protect all routes
router.use(protect);

// Payroll management routes
router.post('/generate', generatePayroll);
router.get('/', getPayroll);
router.put('/:id', updatePayroll);
router.delete('/:id', deletePayroll);
router.put('/:id/approve', approvePayroll);

// Salary slip routes
router.get('/:id/salary-slip', generateSalarySlip);
router.get('/:id/download', downloadSalarySlip);

module.exports = router; 