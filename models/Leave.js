const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
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
  leaveType: {
    type: String,
    enum: ['casual', 'sick', 'earned', 'annual', 'emergency', 'maternity', 'paternity', 'bereavement'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  totalDays: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    required: true,
    minlength: 10,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  appliedDate: {
    type: Date,
    default: Date.now
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedDate: Date,
  rejectionReason: {
    type: String,
    maxlength: 300
  },
  isHalfDay: {
    type: Boolean,
    default: false
  },
  halfDaySession: {
    type: String,
    enum: ['morning', 'afternoon'],
    required: function() {
      return this.isHalfDay;
    }
  }
}, {
  timestamps: true
});

// Calculate total days automatically
leaveSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('startDate') || this.isModified('endDate') || this.isModified('isHalfDay')) {
    if (this.isHalfDay) {
      this.totalDays = 0.5;
    } else {
      const timeDiff = this.endDate.getTime() - this.startDate.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
      this.totalDays = daysDiff;
    }
  }
  next();
});

module.exports = mongoose.model('Leave', leaveSchema); 