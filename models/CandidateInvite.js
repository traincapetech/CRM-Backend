const mongoose = require("mongoose");
const { encrypt, decrypt, isEncrypted } = require("../utils/encryption");

// PII fields to encrypt for candidates (same pattern as Employee.js)
const PII_FIELDS = [
  "dob",
  "currentAddress",
  "panNumber",
  "aadharNumber",
  "bankAccountNumber",
];

const candidateInviteSchema = new mongoose.Schema(
  {
    // ── HR-filled at invite time ──────────────────────────────────────────
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    personalEmail: {
      type: String,
      required: [true, "Personal email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
      required: [true, "Phone number is required"],
    },
    department: {
      type: mongoose.Schema.ObjectId,
      ref: "Department",
      required: [true, "Department is required"],
    },
    role: {
      type: mongoose.Schema.ObjectId,
      ref: "EmployeeRole",
      required: [true, "Role/designation is required"],
    },
    employmentType: {
      type: String,
      enum: ["PERMANENT", "INTERN", "CONTRACT"],
      default: "PERMANENT",
    },
    proposedSalary: {
      type: Number,
      min: 0,
    },
    joiningDate: {
      type: Date,
    },
    joiningTime: {
      type: String, // e.g. "10:00 AM"
      trim: true,
    },
    branchLocation: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    invitedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },

    // ── Token Management ──────────────────────────────────────────────────
    onboardingToken: {
      type: String,
      index: true,
    },
    tokenExpiry: {
      type: Date,
    },
    tokenOpenedAt: {
      type: Date,
    },

    // ── Candidate-filled (Basic) ──────────────────────────────────────────
    dob: {
      type: String, // Stored encrypted
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", "Prefer not to say", ""],
      default: "",
    },
    currentAddress: {
      type: String, // Stored encrypted
    },
    permanentAddress: {
      type: String,
      trim: true,
    },
    emergencyContact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      relation: { type: String, trim: true },
    },

    // ── Candidate-filled (Professional) ──────────────────────────────────
    qualification: {
      type: String,
      trim: true,
    },
    experience: {
      type: String,
      trim: true,
    },
    skills: [
      {
        type: String,
        trim: true,
      },
    ],

    // ── Candidate-filled (Bank & KYC) ─────────────────────────────────────
    panNumber: {
      type: String, // Stored encrypted
    },
    aadharNumber: {
      type: String, // Stored encrypted
    },
    bankName: {
      type: String,
      trim: true,
    },
    bankAccountNumber: {
      type: String, // Stored encrypted
    },
    ifscCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    accountHolderName: {
      type: String,
      trim: true,
    },

    // ── Documents (same Mixed structure as Employee.documents) ─────────────
    documents: {
      resume: { type: mongoose.Schema.Types.Mixed },
      photograph: { type: mongoose.Schema.Types.Mixed },
      panCard: { type: mongoose.Schema.Types.Mixed },
      aadharCard: { type: mongoose.Schema.Types.Mixed },
      educationalDocs: { type: mongoose.Schema.Types.Mixed },
      experienceLetter: { type: mongoose.Schema.Types.Mixed },
      signature: { type: mongoose.Schema.Types.Mixed },
    },

    // ── Declarations ──────────────────────────────────────────────────────
    declarationAccepted: {
      type: Boolean,
      default: false,
    },
    privacyAccepted: {
      type: Boolean,
      default: false,
    },
    joiningTermsAccepted: {
      type: Boolean,
      default: false,
    },
    submittedAt: {
      type: Date,
    },

    // ── HR Review ─────────────────────────────────────────────────────────
    onboardingStatus: {
      type: String,
      enum: [
        "LINK_SENT",
        "OPENED",
        "IN_PROGRESS",
        "SUBMITTED",
        "UNDER_REVIEW",
        "MISSING_DOCS",
        "APPROVED",
        "REJECTED",
        "JOINED",
      ],
      default: "LINK_SENT",
    },
    reviewNotes: {
      type: String,
      trim: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    missingDocsNote: {
      type: String,
      trim: true,
    },
    approvedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    approvedAt: {
      type: Date,
    },

    // ── Final HR Setup (filled before creating Employee) ──────────────────
    officialEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    username: {
      type: String,
      trim: true,
    },
    reportingManagerId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    confirmedSalary: {
      type: Number,
      min: 0,
    },
    probationPeriod: {
      type: Number, // in months
      default: 3,
    },
    workMode: {
      type: String,
      enum: ["Office", "Remote", "Hybrid", ""],
      default: "",
    },

    // ── Links ─────────────────────────────────────────────────────────────
    employeeId: {
      type: mongoose.Schema.ObjectId,
      ref: "Employee",
    },

    // ── Reminder Flags ────────────────────────────────────────────────────
    reminderOneDaySent: {
      type: Boolean,
      default: false,
    },
    joiningDayEmailSent: {
      type: Boolean,
      default: false,
    },

    // ── Audit ─────────────────────────────────────────────────────────────
    invitedAt: {
      type: Date,
      default: Date.now,
    },
    joinedAt: {
      type: Date,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },

    // ── Draft progress tracker ────────────────────────────────────────────
    lastDraftStep: {
      type: Number,
      default: 0, // 0=not started, 1-5=step completed
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── PII Encryption (mirrors Employee.js pattern) ───────────────────────────
candidateInviteSchema.pre("save", function (next) {
  try {
    for (const field of PII_FIELDS) {
      if (this.isModified(field) && this[field]) {
        this[field] = encrypt(this[field]);
      }
    }
    next();
  } catch (error) {
    console.error("CandidateInvite: Error encrypting PII fields:", error);
    return next(error);
  }
});

// ── Decrypt PII for authorized access ─────────────────────────────────────
candidateInviteSchema.methods.getDecryptedPII = function () {
  const decrypted = {};
  for (const field of PII_FIELDS) {
    if (this[field]) {
      try {
        decrypted[field] = decrypt(this[field]);
      } catch (error) {
        console.error(`CandidateInvite: Error decrypting ${field}:`, error);
        decrypted[field] = null;
      }
    }
  }
  return decrypted;
};

// ── Virtual: isTokenExpired ────────────────────────────────────────────────
candidateInviteSchema.virtual("isTokenExpired").get(function () {
  if (!this.tokenExpiry) return true;
  return new Date() > new Date(this.tokenExpiry);
});

// ── Virtual: daysUntilJoining ─────────────────────────────────────────────
candidateInviteSchema.virtual("daysUntilJoining").get(function () {
  if (!this.joiningDate) return null;
  const diff = new Date(this.joiningDate) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// ── Auto-populate refs on find ────────────────────────────────────────────
candidateInviteSchema.pre(/^find/, function (next) {
  this.populate({ path: "department", select: "name" })
    .populate({ path: "role", select: "name" })
    .populate({ path: "invitedBy", select: "fullName email" })
    .populate({ path: "approvedBy", select: "fullName email" })
    .populate({ path: "reportingManagerId", select: "fullName email" })
    .populate({ path: "employeeId", select: "fullName email status" });
  next();
});

module.exports = mongoose.model("CandidateInvite", candidateInviteSchema);
