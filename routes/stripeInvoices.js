const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  createStripeInvoice,
  getStripeInvoices,
  getStripeInvoice,
  handleStripeWebhook,
  sendInvoiceReminder,
  getStripeInvoiceStats
} = require('../controllers/stripeInvoice');

// Webhook route (no auth required)
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Protected routes
router.use(protect);

// Invoice management
router.post('/', authorize('Admin', 'Manager', 'Sales'), createStripeInvoice);
router.get('/', getStripeInvoices);
router.get('/stats', getStripeInvoiceStats);
router.get('/:id', getStripeInvoice);
router.post('/:id/remind', authorize('Admin', 'Manager', 'Sales'), sendInvoiceReminder);

module.exports = router; 