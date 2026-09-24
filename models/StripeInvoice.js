const mongoose = require('mongoose');

const stripeInvoiceSchema = new mongoose.Schema({
  // Stripe-specific fields
  stripeInvoiceId: {
    type: String,
    required: true,
    unique: true
  },
  stripeCustomerId: {
    type: String,
    required: true
  },
  stripeProductId: {
    type: String
  },
  stripePriceId: {
    type: String
  },

  // CRM Invoice reference
  crmInvoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },

  // Customer info
  customerEmail: {
    type: String,
    required: true
  },
  customerName: {
    type: String,
    required: true
  },

  // Invoice details
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'usd'
  },
  status: {
    type: String,
    enum: ['draft', 'open', 'paid', 'uncollectible', 'void'],
    default: 'draft'
  },

  // Payment info
  paidAt: {
    type: Date
  },
  dueDate: {
    type: Date
  },

  // Stripe metadata
  stripeInvoiceUrl: {
    type: String
  },
  stripeInvoicePdf: {
    type: String
  },

  // CRM metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for better query performance
stripeInvoiceSchema.index({ stripeInvoiceId: 1 });
stripeInvoiceSchema.index({ customerEmail: 1 });
stripeInvoiceSchema.index({ status: 1 });
stripeInvoiceSchema.index({ createdBy: 1 });

module.exports = mongoose.model('StripeInvoice', stripeInvoiceSchema); 