const mongoose = require("mongoose");
const { Schema } = mongoose;

const payoutAuditLogSchema = new Schema(
  {
    payrollId: {
      type: Schema.Types.ObjectId,
      ref: "Payroll",
      required: true,
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["INITIATED", "RETRY", "WEBHOOK_SUCCESS", "WEBHOOK_FAILED", "BENEFICIARY_CREATED", "STATUS_CHECK"],
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
    },
    paytmTransactionId: {
      type: String,
      index: true,
    },
    details: {
      type: Schema.Types.Mixed, // Store raw response or error details
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User", // Admin who triggered approval or retry
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("PayoutAuditLog", payoutAuditLogSchema);
