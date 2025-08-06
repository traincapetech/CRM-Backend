const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  // Client Details
  clientName: {
    type: String,
    trim: true
  },
  clientMobile: {
    type: String,
    trim: true
  },
  clientEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  
  // Login Credentials
  clientUsername: {
    type: String,
    unique: true,
    trim: true
  },
  clientPassword: {
    type: String,
    minlength: [6, 'Password must be at least 6 characters']
  },
  
  // Voucher Details
  voucherNumber: {
    type: String,
    unique: true,
    trim: true
  },
  voucherAmount: {
    type: Number,
    min: [0, 'Voucher amount cannot be negative']
  },
  voucherCurrency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY']
  },
  
  // Payment Details
  paymentDate: {
    type: Date
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'UPI', 'PayPal', 'Stripe', 'Other']
  },
  paymentStatus: {
    type: String,
    default: 'Pending',
    enum: ['Pending', 'Completed', 'Failed', 'Refunded']
  },
  
  // Course/Service Details
  courseName: {
    type: String,
    trim: true
  },
  courseDuration: {
    type: String,
    trim: true
  },
  
  // Additional Details
  description: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  
  // Status and Tracking
  status: {
    type: String,
    default: 'Active',
    enum: ['Active', 'Used', 'Expired', 'Cancelled']
  },
  expiryDate: {
    type: Date
  },
  usedDate: {
    type: Date
  },
  
  // Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better performance
voucherSchema.index({ voucherNumber: 1 });
voucherSchema.index({ clientEmail: 1 });
voucherSchema.index({ clientMobile: 1 });
voucherSchema.index({ assignedTo: 1 });
voucherSchema.index({ status: 1 });
voucherSchema.index({ paymentDate: 1 });

// Pre-save middleware to update the updatedAt field
voucherSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance method to mark voucher as used
voucherSchema.methods.markAsUsed = function() {
  this.status = 'Used';
  this.usedDate = new Date();
  return this.save();
};

// Instance method to check if voucher is expired
voucherSchema.methods.isExpired = function() {
  if (!this.expiryDate) return false;
  return new Date() > this.expiryDate;
};

module.exports = mongoose.model('Voucher', voucherSchema); 