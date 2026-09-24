const express = require('express');
const {
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  generatePDF,
  downloadPDF,
  recordPayment,
  getInvoiceStats
} = require('../controllers/invoice');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Routes accessible by Admin, Manager, and Sales Person
router.route('/')
  .get(authorize('Admin', 'Manager', 'Sales Person'), getInvoices)
  .post(authorize('Admin', 'Manager', 'Sales Person'), createInvoice);

router.route('/stats')
  .get(authorize('Admin', 'Manager'), getInvoiceStats);

router.route('/:id')
  .get(authorize('Admin', 'Manager', 'Sales Person'), getInvoice)
  .put(authorize('Admin', 'Manager', 'Sales Person'), updateInvoice)
  .delete(authorize('Admin', 'Manager'), deleteInvoice);

router.route('/:id/pdf')
  .get(authorize('Admin', 'Manager', 'Sales Person'), generatePDF);

router.route('/:id/download')
  .get(authorize('Admin', 'Manager', 'Sales Person'), downloadPDF);

router.route('/:id/payment')
  .post(authorize('Admin', 'Manager', 'Sales Person'), recordPayment);

module.exports = router; 