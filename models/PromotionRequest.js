const mongoose = require("mongoose");

const promotionRequestSchema = new mongoose.Schema(
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
    promotionType: {
      type: String,
      enum: [
        "DESIGNATION_PROMOTION",
        "DEPARTMENT_TRANSFER",
        "LATERAL_MOVEMENT",
        "INTERN_TO_PERMANENT",
        "CAREER_LEVEL_UPGRADE",
        "CUSTOM",
      ],
      default: "DESIGNATION_PROMOTION",
      required: true,
    },

    // Current State Snapshot
    currentRole: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployeeRole",
      default: null,
    },
    currentDepartment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    currentReportingManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    currentEmploymentType: {
      type: String,
      default: "Permanent",
    },
    currentCareerLevel: {
      type: String,
      default: "L1 - Junior",
    },

    // Proposed State Changes
    proposedRole: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployeeRole",
      required: true,
    },
    proposedDepartment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    proposedReportingManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    proposedEmploymentType: {
      type: String,
      default: "Permanent",
    },
    proposedCareerLevel: {
      type: String,
      default: "L2 - Mid",
    },
    proposedSalaryRecommendation: {
      type: Number,
      default: null,
    },

    // Effective Date & Business Justification
    effectiveDate: {
      type: Date,
      required: [true, "Please specify an effective date"],
      default: Date.now,
    },
    businessJustification: {
      type: String,
      required: [true, "Please provide business justification"],
      trim: true,
    },
    reviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PerformanceReview",
      default: null,
    },
    performanceSummaryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PerformanceSummary",
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },

    // Workflow & Approval Status
    status: {
      type: String,
      enum: ["PENDING_HR", "PENDING_ADMIN", "APPROVED", "REJECTED", "CANCELLED"],
      default: "PENDING_HR",
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    hrVerification: {
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      verifiedAt: { type: Date, default: null },
      comments: { type: String, default: "" },
      verified: { type: Boolean, default: false },
    },
    adminApproval: {
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      approvedAt: { type: Date, default: null },
      comments: { type: String, default: "" },
      approved: { type: Boolean, default: false },
    },
    rejectionReason: {
      type: String,
      default: "",
    },

    // System Audit Log
    historyLog: [
      {
        action: { type: String, required: true },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
        notes: { type: String, default: "" },
      },
    ],
  },
  {
    timestamps: true,
    collection: "promotion_requests",
  }
);

promotionRequestSchema.index({ employeeId: 1, createdAt: -1 });
promotionRequestSchema.index({ status: 1 });

module.exports = mongoose.model("PromotionRequest", promotionRequestSchema);
