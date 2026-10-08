const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * PayoutBatch = one "Run Payout" action by an admin.
 * It records WHAT was selected (period / component / branches / employees)
 * and the aggregate result, so every disbursement is traceable to a decision.
 */
const payoutBatchSchema = new Schema(
  {
    // SALARY    = Net Excl. Incentives (monthly)
    // INCENTIVE = performance + project bonus (quarterly)
    // FULL      = whatever is still unpaid on the payslip (salary + incentive)
    component: {
      type: String,
      enum: ["SALARY", "INCENTIVE", "FULL"],
      required: true,
    },
    method: {
      type: String,
      enum: ["PAYTM", "OFFLINE"],
      default: "PAYTM",
    },
    period: {
      month: { type: Number, min: 1, max: 12 }, // SALARY / FULL
      quarter: { type: Number, min: 1, max: 4 }, // INCENTIVE (calendar quarter)
      year: { type: Number, required: true },
    },
    // Selection filters used for this run
    branchIds: [{ type: Schema.Types.ObjectId, ref: "Branch" }],
    employeeIds: [{ type: Schema.Types.ObjectId, ref: "Employee" }],

    totalCount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    pendingCount: { type: Number, default: 0 },
    successAmount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["PROCESSING", "COMPLETED", "PARTIAL", "FAILED"],
      default: "PROCESSING",
      index: true,
    },

    walletBalanceAtStart: { type: Number },
    environment: { type: String, default: "staging" },
    notes: { type: String, maxlength: 500 },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

payoutBatchSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PayoutBatch", payoutBatchSchema);
