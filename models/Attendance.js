const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.ObjectId,
    ref: 'Employee',
    required: [true, 'Please specify the employee']
  },
  date: {
    type: Date,
    required: [true, 'Please specify the date'],
    default: Date.now
  },
  checkInTime: {
    type: Date
  },
  checkOutTime: {
    type: Date
  },
  status: {
    type: String,
    enum: ['PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'EARLY_LEAVE'],
    default: 'PRESENT'
  },
  workingHours: {
    type: Number, // in hours
    default: 0
  },
  notes: {
    type: String,
    trim: true
  },
  isManualEntry: {
    type: Boolean,
    default: false
  },
  enteredBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Calculate working hours before saving
attendanceSchema.pre('save', function(next) {
  if (this.checkInTime && this.checkOutTime) {
    const timeDiff = this.checkOutTime.getTime() - this.checkInTime.getTime();
    this.workingHours = Math.round((timeDiff / (1000 * 60 * 60)) * 100) / 100; // Round to 2 decimal places
  }
  next();
});

// Populate employee details
attendanceSchema.pre(/^find/, function(next) {
  this.populate({
    path: 'employee',
    select: 'fullName email department role'
  }).populate({
    path: 'enteredBy',
    select: 'fullName email'
  });
  next();
});

// Compound index for employee and date (unique)
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema); 