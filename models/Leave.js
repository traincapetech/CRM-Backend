const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.ObjectId,
    ref: 'Employee',
    required: [true, 'Please specify the employee']
  },
  hrId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  fromDate: {
    type: Date,
    required: [true, 'Please specify the start date']
  },
  toDate: {
    type: Date,
    required: [true, 'Please specify the end date']
  },
  reason: {
    type: String,
    required: [true, 'Please provide a reason for leave'],
    trim: true
  },
  leaveType: {
    type: String,
    enum: ['SICK', 'CASUAL', 'ANNUAL', 'MATERNITY', 'PATERNITY', 'EMERGENCY', 'OTHER'],
    default: 'CASUAL'
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'AUTO_REJECTED'],
    default: 'PENDING'
  },
  overrideAutoReject: {
    type: Boolean,
    default: false
  },
  requestDate: {
    type: Date,
    default: Date.now
  },
  approvedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  approvedDate: {
    type: Date
  },
  rejectionReason: {
    type: String,
    trim: true
  },
  totalDays: {
    type: Number
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Calculate total days before saving
leaveSchema.pre('save', function(next) {
  if (this.fromDate && this.toDate) {
    const timeDiff = this.toDate.getTime() - this.fromDate.getTime();
    this.totalDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end dates
  }
  next();
});

// Populate employee and HR details
leaveSchema.pre(/^find/, function(next) {
  this.populate({
    path: 'employee',
    select: 'fullName email department role'
  }).populate({
    path: 'hrId',
    select: 'fullName email'
  }).populate({
    path: 'approvedBy',
    select: 'fullName email'
  });
  next();
});

module.exports = mongoose.model('Leave', leaveSchema); 