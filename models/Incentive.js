const mongoose = require('mongoose');

const incentiveSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['PERFORMANCE', 'PROJECT', 'ATTENDANCE', 'FESTIVAL', 'ANNUAL', 'SPOT_AWARD', 'REFERRAL', 'RETENTION'],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  
  // Performance related fields
  performanceRating: {
    type: Number,
    min: 1,
    max: 5
  },
  performancePeriod: {
    from: Date,
    to: Date
  },
  
  // Project related fields
  projectName: {
    type: String,
    trim: true
  },
  projectCompletionDate: {
    type: Date
  },
  
  // Attendance related fields
  attendancePercentage: {
    type: Number,
    min: 0,
    max: 100
  },
  attendancePeriod: {
    month: Number,
    year: Number
  },
  
  // Festival/Annual bonus fields
  festivalType: {
    type: String,
    enum: ['DIWALI', 'CHRISTMAS', 'EID', 'HOLI', 'DUSSEHRA', 'NEW_YEAR', 'OTHER']
  },
  
  // Status and Approval
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED'],
    default: 'PENDING'
  },
  
  // Approval workflow
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedDate: {
    type: Date
  },
  rejectedReason: {
    type: String,
    trim: true
  },
  
  // Payment details
  paymentDate: {
    type: Date
  },
  paymentMethod: {
    type: String,
    enum: ['SALARY_INCLUDED', 'SEPARATE_PAYMENT', 'CASH', 'BANK_TRANSFER'],
    default: 'SALARY_INCLUDED'
  },
  
  // Include in which payroll
  payrollId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payroll'
  },
  
  // Validity period
  validFrom: {
    type: Date,
    default: Date.now
  },
  validTo: {
    type: Date
  },
  
  // Additional metadata
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringType: {
    type: String,
    enum: ['MONTHLY', 'QUARTERLY', 'YEARLY'],
    required: function() {
      return this.isRecurring;
    }
  },
  
  // Comments and notes
  comments: [{
    commentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    comment: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Attachments (for supporting documents)
  attachments: [{
    filename: String,
    originalName: String,
    path: String,
    size: Number,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for better performance
incentiveSchema.index({ employeeId: 1, type: 1 });
incentiveSchema.index({ status: 1 });
incentiveSchema.index({ validFrom: 1, validTo: 1 });

// Virtual for formatted amount
incentiveSchema.virtual('formattedAmount').get(function() {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: this.currency
  }).format(this.amount);
});

// Method to check if incentive is valid
incentiveSchema.methods.isValid = function() {
  const now = new Date();
  return (!this.validFrom || this.validFrom <= now) && 
         (!this.validTo || this.validTo >= now);
};

// Method to add comment
incentiveSchema.methods.addComment = function(userId, comment) {
  this.comments.push({
    commentBy: userId,
    comment: comment,
    timestamp: new Date()
  });
};

// Static method to get incentives for payroll
incentiveSchema.statics.getIncentivesForPayroll = function(employeeId, month, year) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  return this.find({
    employeeId: employeeId,
    status: 'APPROVED',
    validFrom: { $lte: endDate },
    $or: [
      { validTo: { $gte: startDate } },
      { validTo: null }
    ]
  });
};

// Pre-save middleware
incentiveSchema.pre('save', function(next) {
  // Note: Auto-approval removed - all incentives require manual approval based on sales performance
  next();
});

module.exports = mongoose.model('Incentive', incentiveSchema); 