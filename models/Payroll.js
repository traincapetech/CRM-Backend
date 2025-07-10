const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema({
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
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    required: true
  },
  basicSalary: {
    type: Number,
    required: true
  },
  workingDays: {
    type: Number,
    required: true,
    default: 30
  },
  presentDays: {
    type: Number,
    required: true,
    default: 0
  },
  absentDays: {
    type: Number,
    required: true,
    default: 0
  },
  halfDays: {
    type: Number,
    default: 0
  },
  overtimeHours: {
    type: Number,
    default: 0
  },
  
  // Salary Components
  basicAmount: {
    type: Number,
    required: true
  },
  hra: {
    type: Number,
    default: 0
  },
  da: {
    type: Number,
    default: 0
  },
  conveyanceAllowance: {
    type: Number,
    default: 0
  },
  medicalAllowance: {
    type: Number,
    default: 0
  },
  specialAllowance: {
    type: Number,
    default: 0
  },
  overtimeAmount: {
    type: Number,
    default: 0
  },
  
  // Incentives
  performanceBonus: {
    type: Number,
    default: 0
  },
  projectBonus: {
    type: Number,
    default: 0
  },
  attendanceBonus: {
    type: Number,
    default: 0
  },
  festivalBonus: {
    type: Number,
    default: 0
  },
  
  // Deductions
  pf: {
    type: Number,
    default: 0
  },
  esi: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  loan: {
    type: Number,
    default: 0
  },
  other: {
    type: Number,
    default: 0
  },
  
  // Calculated Fields
  grossSalary: {
    type: Number,
    required: true
  },
  totalDeductions: {
    type: Number,
    required: true
  },
  netSalary: {
    type: Number,
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['DRAFT', 'APPROVED', 'PAID', 'CANCELLED'],
    default: 'DRAFT'
  },
  
  // Approval
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedDate: {
    type: Date
  },
  
  // Payment
  paymentDate: {
    type: Date
  },
  paymentMethod: {
    type: String,
    enum: ['BANK_TRANSFER', 'CASH', 'CHEQUE'],
    default: 'BANK_TRANSFER'
  },
  
  // Salary Slip
  salarySlipPath: {
    type: String
  },
  
  notes: {
    type: String,
    maxlength: 1000
  }
}, {
  timestamps: true
});

// Create compound index for employee, month, and year
payrollSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

// Virtual for month name
payrollSchema.virtual('monthName').get(function() {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[this.month - 1];
});

// Method to calculate salary based on attendance
payrollSchema.methods.calculateSalary = function() {
  // Calculate basic amount based on present days
  const perDayBasic = this.basicSalary / this.workingDays;
  
  // Handle half days (count as 0.5 day)
  const effectivePresentDays = this.presentDays + (this.halfDays * 0.5);
  
  this.basicAmount = perDayBasic * effectivePresentDays;
  
  // Calculate allowances (as percentage of basic salary)
  this.hra = this.basicAmount * 0.40; // 40% of basic
  this.da = this.basicAmount * 0.10; // 10% of basic
  this.conveyanceAllowance = Math.min(1600, this.basicAmount * 0.05); // 5% or max 1600
  this.medicalAllowance = Math.min(1250, this.basicAmount * 0.03); // 3% or max 1250
  this.specialAllowance = this.basicAmount * 0.02; // 2% of basic
  
  // Calculate overtime (1.5x hourly rate)
  const hourlyRate = this.basicSalary / (this.workingDays * 8);
  this.overtimeAmount = this.overtimeHours * hourlyRate * 1.5;
  
  // Note: Attendance bonus removed - incentives are now manual only based on sales
  
  // Calculate gross salary
  this.grossSalary = this.basicAmount + this.hra + this.da + 
                     this.conveyanceAllowance + this.medicalAllowance + 
                     this.specialAllowance + this.overtimeAmount + 
                     this.performanceBonus + this.projectBonus + 
                     this.attendanceBonus + this.festivalBonus;
  
  // Calculate deductions
  this.pf = this.basicAmount * 0.12; // 12% of basic salary
  this.esi = this.grossSalary * 0.0075; // 0.75% of gross salary
  
  // Professional Tax (varies by state, using Karnataka rates)
  if (this.grossSalary > 15000) {
    this.tax = 200;
  } else if (this.grossSalary > 10000) {
    this.tax = 150;
  } else {
    this.tax = 0;
  }
  
  this.totalDeductions = this.pf + this.esi + this.tax + this.loan + this.other;
  
  // Calculate net salary
  this.netSalary = this.grossSalary - this.totalDeductions;
  
  return this.netSalary;
};

// Pre-save middleware to calculate salary
payrollSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('presentDays') || this.isModified('basicSalary')) {
    this.calculateSalary();
  }
  next();
});

module.exports = mongoose.model('Payroll', payrollSchema); 