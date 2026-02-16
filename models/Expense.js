const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: [true, "Please provide an expense title"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, "Please provide an amount"],
      min: [1, "Amount must be at least 1"],
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    category: {
      type: String,
      enum: [
        "Travel",
        "Food",
        "Lodging",
        "Office Supplies",
        "Internet",
        "Phone",
        "Other",
      ],
      default: "Other",
    },
    attachments: [
      {
        url: { type: String, required: true },
        type: { type: String, enum: ["image", "pdf"] },
      },
    ],
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "PAID"],
      default: "PENDING",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvalDate: {
      type: Date,
    },
    rejectionReason: {
      type: String,
    },
    payrollId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payroll",
      default: null, // Links to the payroll run where this was reimbursed
    },
  },
  {
    timestamps: true,
  },
);

// Prevent editing expenses that are already paid
expenseSchema.pre("save", function (next) {
  if (
    this.isModified() &&
    this.status === "PAID" &&
    this.isModified("amount")
  ) {
    const err = new Error("Cannot modify amount of a paid expense.");
    return next(err);
  }
  next();
});

module.exports = mongoose.model("Expense", expenseSchema);
