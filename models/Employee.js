const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');

const employeeSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Please add a full name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  whatsappNumber: {
    type: String,
    trim: true
  },
  linkedInUrl: {
    type: String,
    trim: true
  },
  currentAddress: {
    type: String,
    trim: true
  },
  permanentAddress: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  joiningDate: {
    type: Date,
    default: Date.now
  },
  salary: {
    type: Number,
    min: 0
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'TERMINATED'],
    default: 'ACTIVE'
  },
  employmentType: {
    type: String,
    enum: ['PERMANENT', 'INTERN', 'CONTRACT'],
    default: 'PERMANENT'
  },
  department: {
    type: mongoose.Schema.ObjectId,
    ref: 'Department',
    required: [true, 'Please assign a department']
  },
  role: {
    type: mongoose.Schema.ObjectId,
    ref: 'EmployeeRole',
    required: [true, 'Please assign a role']
  },
  hrId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  // Educational Information
  collegeName: {
    type: String,
    trim: true
  },
  internshipDuration: {
    type: Number // in months
  },
  internshipStartDate: {
    type: Date
  },
  internshipEndDate: {
    type: Date
  },
  skills: [{
    type: String,
    trim: true
  }],
  projectAssignments: [{
    projectName: {
      type: String,
      required: true,
      trim: true
    },
    role: {
      type: String,
      trim: true
    },
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'ON_HOLD'],
      default: 'ACTIVE'
    }
  }],
  // Document Storage (supporting both simple strings and detailed objects)
  photograph: {
    type: mongoose.Schema.Types.Mixed
  },
  tenthMarksheet: {
    type: mongoose.Schema.Types.Mixed
  },
  twelfthMarksheet: {
    type: mongoose.Schema.Types.Mixed
  },
  bachelorDegree: {
    type: mongoose.Schema.Types.Mixed
  },
  postgraduateDegree: {
    type: mongoose.Schema.Types.Mixed
  },
  aadharCard: {
    type: mongoose.Schema.Types.Mixed
  },
  panCard: {
    type: mongoose.Schema.Types.Mixed
  },
  pcc: {
    type: mongoose.Schema.Types.Mixed
  },
  resume: {
    type: mongoose.Schema.Types.Mixed
  },
  offerLetter: {
    type: mongoose.Schema.Types.Mixed
  },
  // General documents object for additional flexibility
  documents: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // User account reference
  userId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },

  // Biometric device mapping (empCode)
  biometricCode: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
    default: null
  },
  biometricEnabled: {
    type: Boolean,
    default: false
  },
  
  // Payment Details for Paytm Payouts (migrated from Razorpay)
  // Payment mode: "bank" for bank transfers, "upi" for UPI payments
  paymentMode: {
    type: String,
    enum: ['bank', 'upi', null],
    default: null
  },
  
  // Bank Account Details (for bank transfers)
  bankAccountNumber: {
    type: String,
    default: null
    // Note: This field will be encrypted before saving (handled in pre-save hook)
  },
  ifscCode: {
    type: String,
    trim: true,
    default: null,
    uppercase: true
  },
  accountHolderName: {
    type: String,
    trim: true,
    default: null
  },
  
  // UPI Details (for UPI payments)
  upiId: {
    type: String,
    trim: true,
    default: null,
    lowercase: true
  },
  
  // Paytm Integration Fields (replaces Razorpay fields)
  // Migration Note: razorpayContactId and razorpayFundAccountId replaced with paytmBeneficiaryId
  paytmBeneficiaryId: {
    type: String,
    default: null
  },
  
  // Payment Verification Status (renamed from paymentVerified for clarity)
  paytmVerified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Encrypt bank account number before saving
employeeSchema.pre('save', function(next) {
  // Only encrypt if bankAccountNumber is being modified and is not already encrypted
  if (this.isModified('bankAccountNumber') && this.bankAccountNumber) {
    try {
      // Check if already encrypted (encrypted format: iv:authTag:encryptedData)
      const isEncrypted = this.bankAccountNumber.includes(':') && this.bankAccountNumber.split(':').length === 3;
      if (!isEncrypted) {
        this.bankAccountNumber = encrypt(this.bankAccountNumber);
      }
    } catch (error) {
      console.error('Error encrypting bank account number:', error);
      return next(error);
    }
  }
  next();
});

// Decrypt bank account number when retrieving (only for authorized users)
employeeSchema.methods.getDecryptedBankAccount = function() {
  if (!this.bankAccountNumber) return null;
  try {
    return decrypt(this.bankAccountNumber);
  } catch (error) {
    console.error('Error decrypting bank account number:', error);
    return null;
  }
};

// Populate department and role on find
employeeSchema.pre(/^find/, function(next) {
  this.populate({
    path: 'department',
    select: 'name description'
  }).populate({
    path: 'role',
    select: 'name description'
  }).populate({
    path: 'hrId',
    select: 'fullName email'
  });
  next();
});

// Ensure biometric codes are unique when provided
employeeSchema.index({ biometricCode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Employee', employeeSchema);