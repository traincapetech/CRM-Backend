const mongoose = require("mongoose");

const MonthlyPerformanceRecordSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    month: {
      type: Number,
      required: true,
    },
    periodKey: {
      type: String, // YYYY-MM
      required: true,
    },
    role: {
      type: String,
      required: true,
    },

    // Lead Person Metrics
    actualLeads: {
      type: Number,
      default: 0,
    },
    targetLeads: {
      type: Number, // dailyTarget * workingDaysInMonth
      default: 0,
    },
    minimumLeads: {
      type: Number, // minTarget * workingDaysInMonth
      default: 0,
    },
    workingDays: {
      type: Number,
      default: 0,
    },

    // Sales Person Metrics
    actualSales: {
      type: Number,
      default: 0,
    },
    targetSales: {
      type: Number, // monthlySalesTarget
      default: 0,
    },

    // Common Results
    monthlyScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    ratingTier: {
      type: String,
      enum: ["excellent", "good", "average", "below-average", "poor"],
    },
    stars: {
      type: Number,
      min: 1,
      max: 5,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "monthly_performance_records",
  },
);

// Compound index for unique performance record per month
MonthlyPerformanceRecordSchema.index(
  { employeeId: 1, periodKey: 1 },
  { unique: true },
);

// Update timestamp on save
MonthlyPerformanceRecordSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model(
  "MonthlyPerformanceRecord",
  MonthlyPerformanceRecordSchema,
);
