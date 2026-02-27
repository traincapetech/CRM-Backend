const mongoose = require("mongoose");

const deductionHistorySchema = new mongoose.Schema(
  {
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
    },
    deductedAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    deductedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    payrollId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payroll",
    },
    deductedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const employeeAdvanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: [true, "Employee ID is required"],
    },
    totalAmount: {
      type: Number,
      required: [true, "Total advance amount is required"],
      min: [1, "Amount must be at least 1"],
    },
    remainingAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    deductionType: {
      type: String,
      enum: ["full", "partial"],
      required: [true, "Deduction type is required"],
    },
    deductionAmountPerMonth: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "completed"],
      default: "active",
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    deductionHistory: [deductionHistorySchema],
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient payroll queries
employeeAdvanceSchema.index({ employeeId: 1, status: 1 });

// Virtual for total deducted
employeeAdvanceSchema.virtual("totalDeducted").get(function () {
  return this.totalAmount - this.remainingAmount;
});

// Ensure virtuals are included in JSON
employeeAdvanceSchema.set("toJSON", { virtuals: true });
employeeAdvanceSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("EmployeeAdvance", employeeAdvanceSchema);
