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
    required: function () {
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
    required: function () {
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
  source: {
    type: String,
    enum: ['MANUAL', 'BIOMETRIC'],
    default: 'MANUAL'
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
attendanceSchema.virtual('formattedDate').get(function () {
  return this.date.toDateString();
});

// Method to calculate total hours and determine status
attendanceSchema.methods.calculateTotalHours = async function () {
  if (this.checkIn && this.checkOut) {
    const diff = this.checkOut - this.checkIn;
    this.totalHours = diff / (1000 * 60 * 60); // Convert to hours

    // Standard working hours defaults
    let standardHours = 8;
    let halfDayThreshold = 4;
    let presentThreshold = 7;

    try {
      // Determine if the employee is an INTERN
      const Employee = mongoose.model('Employee');
      const employee = await Employee.findById(this.employeeId);

      if (employee && employee.employmentType === 'INTERN') {
        halfDayThreshold = 3;
        presentThreshold = 5.5;
        // Intern standard hours can remain 8 for overtime purposes unless requested otherwise
      }
    } catch (err) {
      console.error('Error fetching employee for attendance calculation:', err);
    }

    if (this.totalHours > standardHours) {
      this.isOvertime = true;
      this.overtimeHours = this.totalHours - standardHours;
    }

    // Determine status based on hours and thresholds
    if (this.totalHours < halfDayThreshold) {
      this.status = 'HALF_DAY';
    } else if (this.totalHours < presentThreshold) {
      this.status = 'EARLY_LEAVE';
    } else {
      this.status = 'PRESENT';
    }
  }
};

// Pre-save middleware to calculate hours
attendanceSchema.pre('save', async function (next) {
  if (this.checkIn && this.checkOut) {
    await this.calculateTotalHours();
  }
  next();
});

module.exports = mongoose.model('Attendance', attendanceSchema); 