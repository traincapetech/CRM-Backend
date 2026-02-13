const mongoose = require("mongoose");

const EmployeeTargetSchema = new mongoose.Schema(
  {
    // Which employee this target is for
    employeeId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },

    // Which KPI this target is for
    kpiId: {
      type: mongoose.Schema.ObjectId,
      ref: "KPIDefinition",
      required: true,
    },

    // Time period for this target
    period: {
      startDate: {
        type: Date,
        required: true,
      },
      endDate: {
        type: Date,
        required: true,
      },
      // For easy querying (e.g., "2025-01", "2025-Q1")
      periodKey: {
        type: String,
        required: true,
      },
    },

    // Custom targets (can override KPI defaults)
    targets: {
      minimum: Number,
      target: Number,
      excellent: Number,
    },

    // Actual performance (updated by cron job or manually)
    actual: {
      type: Number,
      default: 0,
    },

    // Calculated score (0-100)
    score: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // Status based on performance
    status: {
      type: String,
      enum: ["excellent", "on-track", "at-risk", "failing", "not-started"],
      default: "not-started",
    },

    // For manual entry
    isManual: {
      type: Boolean,
      default: false,
    },

    // Notes/comments
    notes: String,

    // Audit trail
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    lastCalculated: {
      type: Date,
    },
  },
  {
    collection: "employee_targets",
  },
);

// Update timestamp on save
EmployeeTargetSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Compound indexes for faster queries
EmployeeTargetSchema.index(
  { employeeId: 1, kpiId: 1, "period.periodKey": 1 },
  { unique: true },
);
EmployeeTargetSchema.index({ employeeId: 1, status: 1 });
EmployeeTargetSchema.index({ "period.startDate": 1, "period.endDate": 1 });

module.exports = mongoose.model("EmployeeTarget", EmployeeTargetSchema);
