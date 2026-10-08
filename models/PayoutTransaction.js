const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * PayoutTransaction = one money transfer to one employee.
 * A transfer can cover several payroll records (e.g. a quarterly incentive
 * that sums Jul + Aug + Sep), so it carries `allocations` describing how the
 * amount maps back onto each payslip.
 */
const allocationSchema = new Schema(
  {
    payrollId: { type: Schema.Types.ObjectId, ref: "Payroll", required: true },
    component: { type: String, enum: ["SALARY", "INCENTIVE"], required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const payoutTransactionSchema = new Schema(
  {
    batchId: {
      type: Schema.Types.ObjectId,
      ref: "PayoutBatch",
      required: true,
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", index: true },

    component: {
      type: String,
      enum: ["SALARY", "INCENTIVE", "FULL"],
      required: true,
    },
    method: { type: String, enum: ["PAYTM", "OFFLINE"], default: "PAYTM" },

    amount: { type: Number, required: true, min: 0 },
    allocations: [allocationSchema],

    period: {
      month: Number,
      quarter: Number,
      year: Number,
    },
    periodLabel: String, // e.g. "September 2026" or "Q3 2026 (Jul-Sep)"

    // Unique id sent to Paytm. Guarantees a transfer can never be sent twice.
    transferId: { type: String, required: true, unique: true, index: true },
    attempt: { type: Number, default: 1 },
    transferMode: { type: String, enum: ["IMPS", "UPI", "NEFT", null] },

    // INITIATED = recorded locally, Paytm not yet called/confirmed
    status: {
      type: String,
      enum: ["INITIATED", "PENDING", "SUCCESS", "FAILED"],
      default: "INITIATED",
      index: true,
    },
    failureReason: String,
    paytmResponse: Schema.Types.Mixed,

    // True once allocations have been applied to the payslips (idempotency guard)
    settled: { type: Boolean, default: false },
    paidAt: Date,

    environment: { type: String, default: "staging" },
    initiatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

payoutTransactionSchema.index({ "period.year": 1, "period.month": 1 });
payoutTransactionSchema.index({ "allocations.payrollId": 1 });

module.exports = mongoose.model("PayoutTransaction", payoutTransactionSchema);
