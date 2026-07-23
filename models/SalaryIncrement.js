const mongoose = require("mongoose");

const salaryIncrementSchema = new mongoose.Schema(
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
    incrementType: {
      type: String,
      enum: [
        "PERCENTAGE",
        "FIXED_AMOUNT",
        "PROMOTION_INCREMENT",
        "ANNUAL_APPRAISAL",
        "SPECIAL_ADJUSTMENT",
        "MARKET_CORRECTION",
        "PROBATION_COMPLETION",
      ],
      default: "ANNUAL_APPRAISAL",
      required: true,
    },

    // Compensation Snapshots
    previousSalary: {
      type: Number,
      required: [true, "Previous salary is required"],
      min: 0,
    },
    incrementAmount: {
      type: Number,
      required: [true, "Increment amount is required"],
      min: 0,
    },
    incrementPercentage: {
      type: Number,
      default: 0,
    },
    newSalary: {
      type: Number,
      required: [true, "New salary is required"],
      min: 0,
    },
    proposedComponents: {
      basicSalary: { type: Number, default: 0 },
      allowances: { type: Number, default: 0 },
      variablePay: { type: Number, default: 0 },
    },

    // Effective Date & Justification
    effectiveDate: {
      type: Date,
      required: [true, "Please specify an effective date"],
      default: Date.now,
    },
    reason: {
      type: String,
      required: [true, "Please provide justification for salary revision"],
      trim: true,
    },
    reviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PerformanceReview",
      default: null,
    },
    promotionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PromotionRequest",
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },

    // Approval Workflow Status
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

    // Audit History
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
    collection: "salary_increments",
  }
);

salaryIncrementSchema.index({ employeeId: 1, createdAt: -1 });
salaryIncrementSchema.index({ status: 1 });

module.exports = mongoose.model("SalaryIncrement", salaryIncrementSchema);
