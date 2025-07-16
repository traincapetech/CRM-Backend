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
  baseSalary: {
    type: Number,
    required: true
  },
  daysPresent: {
    type: Number,
    required: true,
    default: 0
  },
  calculatedSalary: {
    type: Number,
    required: true,
    default: 0
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
    default: 0
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
    default: 0
  },
  totalDeductions: {
    type: Number,
    default: 0
  },
  netSalary: {
    type: Number,
    default: 0
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

// Method to calculate salary based on manual input
payrollSchema.methods.calculateSalary = function() {
  console.log('🧮 Starting fully manual salary calculation for payroll:', this._id);
  console.log('📊 All input values:', {
    baseSalary: this.baseSalary,
    daysPresent: this.daysPresent,
    calculatedSalary: this.calculatedSalary,
    // Manual Allowances
    hra: this.hra,
    da: this.da,
    conveyanceAllowance: this.conveyanceAllowance,
    medicalAllowance: this.medicalAllowance,
    specialAllowance: this.specialAllowance,
    overtimeAmount: this.overtimeAmount,
    // Manual Bonuses
    performanceBonus: this.performanceBonus,
    projectBonus: this.projectBonus,
    attendanceBonus: this.attendanceBonus,
    festivalBonus: this.festivalBonus,
    // Manual Deductions
    pf: this.pf,
    esi: this.esi,
    tax: this.tax,
    loan: this.loan,
    other: this.other
  });

  // 1. Basic amount is the manually calculated salary
  this.basicAmount = this.calculatedSalary || 0;
  console.log('💰 Basic amount (calculated salary):', this.basicAmount);
  
  // 2. Calculate gross salary = basic + ALL manual allowances + ALL manual bonuses
  this.grossSalary = this.basicAmount + 
                     (this.hra || 0) + 
                     (this.da || 0) + 
                     (this.conveyanceAllowance || 0) + 
                     (this.medicalAllowance || 0) + 
                     (this.specialAllowance || 0) + 
                     (this.overtimeAmount || 0) + 
                     (this.performanceBonus || 0) + 
                     (this.projectBonus || 0) + 
                     (this.attendanceBonus || 0) + 
                     (this.festivalBonus || 0);
  
  console.log('💵 Gross salary calculated:', {
    basicAmount: this.basicAmount,
    totalAllowances: (this.hra || 0) + (this.da || 0) + (this.conveyanceAllowance || 0) + (this.medicalAllowance || 0) + (this.specialAllowance || 0) + (this.overtimeAmount || 0),
    totalBonuses: (this.performanceBonus || 0) + (this.projectBonus || 0) + (this.attendanceBonus || 0) + (this.festivalBonus || 0),
    grossSalary: this.grossSalary
  });
  
  // 3. Calculate total deductions = ALL manual deductions
  this.totalDeductions = (this.pf || 0) + 
                         (this.esi || 0) + 
                         (this.tax || 0) + 
                         (this.loan || 0) + 
                         (this.other || 0);
  
  console.log('📉 Deductions calculated:', {
    pf: this.pf || 0,
    esi: this.esi || 0,
    tax: this.tax || 0,
    loan: this.loan || 0,
    other: this.other || 0,
    totalDeductions: this.totalDeductions
  });
  
  // 4. Calculate net salary = gross - total deductions
  this.netSalary = this.grossSalary - this.totalDeductions;
  
  console.log('🎯 Final manual calculation:', {
    grossSalary: this.grossSalary,
    totalDeductions: this.totalDeductions,
    netSalary: this.netSalary
  });
  
  console.log('✅ Formula: Basic + All Allowances + All Bonuses - All Deductions = Net Salary');
  console.log(`✅ ${this.basicAmount} + ${(this.hra || 0) + (this.da || 0) + (this.conveyanceAllowance || 0) + (this.medicalAllowance || 0) + (this.specialAllowance || 0) + (this.overtimeAmount || 0)} + ${(this.performanceBonus || 0) + (this.projectBonus || 0) + (this.attendanceBonus || 0) + (this.festivalBonus || 0)} - ${this.totalDeductions} = ${this.netSalary}`);
  
  return this.netSalary;
};

// Pre-save middleware to calculate salary
payrollSchema.pre('save', function(next) {
  // Always recalculate when saving
  this.calculateSalary();
  next();
});

module.exports = mongoose.model('Payroll', payrollSchema); 