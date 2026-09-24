const mongoose = require("mongoose");

const incentiveCycleSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "CLEARED"],
      default: "ACTIVE",
    },
    months: [
      {
        monthIndex: { type: Number, required: true },
        salesCount: { type: Number, default: 0 },
      },
    ],
    totalSalesCount: {
      type: Number,
      default: 0,
    },
    incentiveAmount: {
      type: Number,
      default: 0,
    },
    clearedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("IncentiveCycle", incentiveCycleSchema);
