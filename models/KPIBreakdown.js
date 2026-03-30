const mongoose = require("mongoose");

const KPIBreakdownSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    month: {
      type: Number,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    role: {
      type: String,
      enum: ["Sales Person", "Lead Person"],
      required: true,
    },
    summary: {
      currentRating: { type: Number, default: 0 },
      ratingTier: { type: String, default: "N/A" },
      stars: { type: Number, default: 0 },
      streak: {
        description: { type: String },
        type: { type: String },
        days: { type: Number, default: 0 },
      },
    },
    averages: {
      last7Days: { type: Number, default: 0 },
      last30Days: { type: Number, default: 0 },
      last90Days: { type: Number, default: 0 },
      thisMonth: { type: Number, default: 0 },
    },
    targets: [
      {
        kpiId: {
          kpiName: String,
        },
        kpiName: String,
        actual: Number,
        target: Number,
        baseTarget: Number,
        score: Number,
        status: String,
      },
    ],
  },
  {
    timestamps: true,
    collection: "kpi_breakdowns",
  },
);

// Compound index for unique records per employee per month
KPIBreakdownSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("KPIBreakdown", KPIBreakdownSchema);
