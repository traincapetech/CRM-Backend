const mongoose = require("mongoose");

const DailyPerformanceRecordSchema = new mongoose.Schema(
  {
    // Which employee
    employeeId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },

    // Date of this performance record
    date: {
      type: Date,
      required: true,
    },

    // For easy querying (e.g., "2025-02-13")
    dateKey: {
      type: String,
      required: true,
    },

    // KPI scores for this day
    kpiScores: [
      {
        kpiId: {
          type: mongoose.Schema.ObjectId,
          ref: "KPIDefinition",
        },
        kpiName: String,
        target: Number,
        actual: Number,
        score: Number, // 0-100
        status: {
          type: String,
          enum: ["excellent", "on-track", "at-risk", "failing"],
        },
        weight: Number, // Weight of this KPI
      },
    ],

    // Overall weighted score for the day
    overallScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // Rating based on score
    rating: {
      type: String,
      enum: ["excellent", "good", "average", "below-average", "poor"],
    },

    // Star rating (1-5)
    stars: {
      type: Number,
      min: 1,
      max: 5,
    },

    // Notes/comments for this day
    notes: String,

    // Automated or manual?
    isAutomated: {
      type: Boolean,
      default: true,
    },

    // Audit trail
    createdAt: {
      type: Date,
      default: Date.now,
    },
    calculatedAt: {
      type: Date,
    },
  },
  {
    collection: "daily_performance_records",
  },
);

// Unique constraint: one record per employee per day
DailyPerformanceRecordSchema.index(
  { employeeId: 1, dateKey: 1 },
  { unique: true },
);

// For date range queries
DailyPerformanceRecordSchema.index({ employeeId: 1, date: -1 });

// For finding low performers
DailyPerformanceRecordSchema.index({ overallScore: 1, date: -1 });

module.exports = mongoose.model(
  "DailyPerformanceRecord",
  DailyPerformanceRecordSchema,
);
