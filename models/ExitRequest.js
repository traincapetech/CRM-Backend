const mongoose = require("mongoose");

const exitRequestSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Exit Metadata
    exitType: {
      type: String,
      enum: [
        "RESIGNATION",
        "TERMINATION",
        "RETIREMENT",
        "CONTRACT_COMPLETION",
        "INTERNSHIP_COMPLETION",
        "MUTUAL_SEPARATION",
      ],
      required: true,
      default: "RESIGNATION",
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    resignationDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastWorkingDay: {
      type: Date,
      required: true,
    },
    noticePeriodDays: {
      type: Number,
      default: 30,
    },
    remainingNoticeDays: {
      type: Number,
      default: 30,
    },

    // Offboarding Lifecycle Status
    status: {
      type: String,
      enum: [
        "NOTICE_SUBMITTED",
        "MANAGER_REVIEW",
        "HR_VERIFICATION",
        "CLEARANCE_IN_PROGRESS",
        "SETTLEMENT_PENDING",
        "FINAL_APPROVAL",
        "COMPLETED_ARCHIVED",
        "REJECTED",
        "WITHDRAWN",
      ],
      default: "NOTICE_SUBMITTED",
      index: true,
    },

    // 1. Manager Approval Sign-Off
    managerReview: {
      status: {
        type: String,
        enum: ["PENDING", "APPROVED", "REJECTED"],
        default: "PENDING",
      },
      comments: { type: String, default: "" },
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      reviewedAt: { type: Date, default: null },
    },

    // 2. HR Verification
    hrVerification: {
      status: {
        type: String,
        enum: ["PENDING", "VERIFIED"],
        default: "PENDING",
      },
      comments: { type: String, default: "" },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      verifiedAt: { type: Date, default: null },
    },

    // 3. Knowledge Transfer & Handover
    knowledgeTransfer: {
      successorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
        default: null,
      },
      handoverDocUrl: { type: String, default: "" },
      status: {
        type: String,
        enum: ["PENDING", "COMPLETED"],
        default: "PENDING",
      },
      remarks: { type: String, default: "" },
    },

    // 4. Asset Clearance Status (Integrated with Asset Module)
    assetClearance: {
      isCleared: { type: Boolean, default: false },
      pendingAssetsCount: { type: Number, default: 0 },
      overrideBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      overrideReason: { type: String, default: "" },
      clearedAt: { type: Date, default: null },
    },

    // 5. Leave Encashment Settlement (Integrated with Leave Module)
    leaveSettlement: {
      earnedLeaveBalance: { type: Number, default: 0 },
      usedLeave: { type: Number, default: 0 },
      encashableDays: { type: Number, default: 0 },
      dailyRate: { type: Number, default: 0 },
      totalEncashmentAmount: { type: Number, default: 0 },
    },

    // 6. Full & Final Payroll Settlement
    payrollSettlement: {
      pendingSalary: { type: Number, default: 0 },
      reimbursements: { type: Number, default: 0 },
      deductions: { type: Number, default: 0 },
      noticeBuyoutAmount: { type: Number, default: 0 },
      finalSettlementTotal: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ["PENDING", "PROCESSED"],
        default: "PENDING",
      },
      processedAt: { type: Date, default: null },
    },

    // 7. Configurable Offboarding Checklist
    checklist: [
      {
        key: { type: String, required: true },
        label: { type: String, required: true },
        isCompleted: { type: Boolean, default: false },
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        updatedAt: { type: Date, default: Date.now },
      },
    ],

    // 8. Confidential Exit Interview
    exitInterview: {
      feedback: { type: String, default: "" },
      reasonCategory: { type: String, default: "Better Opportunity" },
      suggestions: { type: String, default: "" },
      rehireEligible: { type: Boolean, default: true },
      hrNotes: { type: String, default: "" },
    },

    // 9. Final Admin Approval & Archival Sign-Off
    finalApproval: {
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      approvedAt: { type: Date, default: null },
      comments: { type: String, default: "" },
    },

    // Audit History Log
    historyLog: [
      {
        action: { type: String, required: true },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        notes: { type: String, default: "" },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    collection: "exit_requests",
  },
);

module.exports = mongoose.model("ExitRequest", exitRequestSchema);
