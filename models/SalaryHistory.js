const mongoose = require("mongoose");

const salaryHistorySchema = new mongoose.Schema(
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
    incrementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalaryIncrement",
      default: null,
    },
    promotionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PromotionRequest",
      default: null,
    },
    reviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PerformanceReview",
      default: null,
    },
    previousSalary: {
      type: Number,
      required: true,
      min: 0,
    },
    newSalary: {
      type: Number,
      required: true,
      min: 0,
    },
    incrementAmount: {
      type: Number,
      required: true,
    },
    incrementPercentage: {
      type: Number,
      required: true,
    },
    changeType: {
      type: String,
      enum: [
        "INCREMENT",
        "PROMOTION",
        "MARKET_ADJUSTMENT",
        "PROBATION_COMPLETION",
        "MANUAL_REVISION",
      ],
      default: "INCREMENT",
    },
    effectiveDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    reason: {
      type: String,
      trim: true,
      default: "",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "salary_histories",
  }
);

salaryHistorySchema.index({ employeeId: 1, effectiveDate: -1 });

module.exports = mongoose.model("SalaryHistory", salaryHistorySchema);
