const mongoose = require("mongoose");
const { encrypt, decrypt, isEncrypted } = require("../utils/encryption");

const employeeSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Please add a full name"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    // PII Fields - encrypted at rest
    phoneNumber: {
      type: String,
      trim: true,
    },
    whatsappNumber: {
      type: String,
      trim: true,
    },
    linkedInUrl: {
      type: String,
      trim: true,
    },
    currentAddress: {
      type: String,
      trim: true,
    },
    permanentAddress: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: String, // Stored as encrypted string
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    salary: {
      type: Number,
      min: 0,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "TERMINATED", "COMPLETED"],
      default: "ACTIVE",
    },
    employmentType: {
      type: String,
      enum: ["PERMANENT", "INTERN", "CONTRACT"],
      default: "PERMANENT",
    },
    department: {
      type: mongoose.Schema.ObjectId,
      ref: "Department",
      required: [true, "Please assign a department"],
    },
    role: {
      type: mongoose.Schema.ObjectId,
      ref: "EmployeeRole",
      required: [true, "Please assign a role"],
    },
    hrId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    // Educational Information
    collegeName: {
      type: String,
      trim: true,
    },
    internshipDuration: {
      type: Number, // in months
    },
    internshipStartDate: {
      type: Date,
    },
    internshipEndDate: {
      type: Date,
    },
    skills: [
      {
        type: String,
        trim: true,
      },
    ],
    projectAssignments: [
      {
        projectName: {
          type: String,
          required: true,
          trim: true,
        },
        role: {
          type: String,
          trim: true,
        },
        startDate: {
          type: Date,
        },
        endDate: {
          type: Date,
        },
        status: {
          type: String,
          enum: ["ACTIVE", "COMPLETED", "ON_HOLD"],
          default: "ACTIVE",
        },
      },
    ],
    // Document Storage (supporting both simple strings and detailed objects)
    photograph: {
      type: mongoose.Schema.Types.Mixed,
    },
    tenthMarksheet: {
      type: mongoose.Schema.Types.Mixed,
    },
    twelfthMarksheet: {
      type: mongoose.Schema.Types.Mixed,
    },
    bachelorDegree: {
      type: mongoose.Schema.Types.Mixed,
    },
    postgraduateDegree: {
      type: mongoose.Schema.Types.Mixed,
    },
    // Sensitive ID Documents - encrypted
    aadharCard: {
      type: String, // Encrypted
    },
    panCard: {
      type: String, // Encrypted
    },
    pcc: {
      type: mongoose.Schema.Types.Mixed,
    },
    resume: {
      type: mongoose.Schema.Types.Mixed,
    },
    offerLetter: {
      type: mongoose.Schema.Types.Mixed,
    },
    // General documents object for additional flexibility
    documents: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // User account reference
    userId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },

    // Biometric device mapping (empCode)
    biometricCode: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    biometricEnabled: {
      type: Boolean,
      default: false,
    },

    // Payment Details for Paytm Payouts
    paymentMode: {
      type: String,
      enum: ["bank", "upi", null],
      default: null,
    },

    // Bank Account Details (encrypted)
    bankAccountNumber: {
      type: String,
      default: null,
    },
    ifscCode: {
      type: String,
      trim: true,
      default: null,
      uppercase: true,
    },
    accountHolderName: {
      type: String,
      trim: true,
      default: null,
    },

    // UPI Details (encrypted)
    upiId: {
      type: String,
      default: null,
    },

    // Paytm Integration Fields
    paytmBeneficiaryId: {
      type: String,
      default: null,
    },

    // Payment Verification Status
    paytmVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// PII fields to encrypt
const PII_FIELDS = [
  "phoneNumber",
  "whatsappNumber",
  "currentAddress",
  "permanentAddress",
  "dateOfBirth",
  "aadharCard",
  "panCard",
  "bankAccountNumber",
  "upiId",
];

// Encrypt PII fields before saving
employeeSchema.pre("save", function (next) {
  try {
    for (const field of PII_FIELDS) {
      if (this.isModified(field) && this[field]) {
        // encrypt() already checks for double-encryption
        this[field] = encrypt(this[field]);
      }
    }
    next();
  } catch (error) {
    console.error("Error encrypting PII fields:", error);
    return next(error);
  }
});

// Decrypt all PII fields for authorized access
employeeSchema.methods.getDecryptedPII = function () {
  const decrypted = {};
  for (const field of PII_FIELDS) {
    if (this[field]) {
      try {
        decrypted[field] = decrypt(this[field]);
      } catch (error) {
        console.error(`Error decrypting ${field}:`, error);
        decrypted[field] = null;
      }
    }
  }
  return decrypted;
};

// Decrypt bank account number (legacy method for backward compatibility)
employeeSchema.methods.getDecryptedBankAccount = function () {
  if (!this.bankAccountNumber) return null;
  try {
    return decrypt(this.bankAccountNumber);
  } catch (error) {
    console.error("Error decrypting bank account number:", error);
    return null;
  }
};

// Populate department and role on find
employeeSchema.pre(/^find/, function (next) {
  this.populate({
    path: "department",
    select: "name description",
  })
    .populate({
      path: "role",
      select: "name description",
    })
    .populate({
      path: "hrId",
      select: "fullName email",
    });
  next();
});

// Ensure biometric codes are unique when provided
employeeSchema.index({ biometricCode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Employee", employeeSchema);
