const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      // userId is required only if it's not an admin-created record
      return !this.isAdminCreated;
    }
  },
  date: {
    type: Date,
    required: true
  },
  checkIn: {
    type: Date,
    required: function() {
      // checkIn is required only if it's not an admin-created record
      return !this.isAdminCreated;
    }
  },
  checkOut: {
    type: Date
  },
  totalHours: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'EARLY_LEAVE'],
    default: 'PRESENT'
  },
  isOvertime: {
    type: Boolean,
    default: false
  },
  overtimeHours: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    maxlength: 500
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isAdminCreated: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Create compound index for employee and date
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

// Virtual for formatted date
attendanceSchema.virtual('formattedDate').get(function() {
  return this.date.toDateString();
});

// Method to calculate total hours
attendanceSchema.methods.calculateTotalHours = function() {
  if (this.checkIn && this.checkOut) {
    const diff = this.checkOut - this.checkIn;
    this.totalHours = diff / (1000 * 60 * 60); // Convert to hours
    
    // Standard working hours (8 hours)
    const standardHours = 8;
    if (this.totalHours > standardHours) {
      this.isOvertime = true;
      this.overtimeHours = this.totalHours - standardHours;
    }
    
    // Determine status based on hours
    if (this.totalHours < 4) {
      this.status = 'HALF_DAY';
    } else if (this.totalHours < 7) {
      this.status = 'EARLY_LEAVE';
    } else {
      this.status = 'PRESENT';
    }
  }
};

// Pre-save middleware to calculate hours
attendanceSchema.pre('save', function(next) {
  if (this.checkIn && this.checkOut) {
    this.calculateTotalHours();
  }
  next();
});

module.exports = mongoose.model('Attendance', attendanceSchema); 