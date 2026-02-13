const mongoose = require("mongoose");

const KPIDefinitionSchema = new mongoose.Schema(
  {
    // Which role this KPI applies to
    role: {
      type: String,
      enum: [
        "Sales Person",
        "Lead Person",
        "Manager",
        "Admin",
        "HR",
        "Employee",
        "IT Manager",
        "IT Intern",
        "IT Permanent",
      ],
      required: true,
    },

    // KPI Details
    kpiName: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    // What type of metric (count, amount, percentage, etc.)
    metricType: {
      type: String,
      enum: ["count", "amount", "percentage", "rating", "boolean"],
      required: true,
    },

    // How often is this measured
    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly", "quarterly", "annually"],
      required: true,
    },

    // Performance thresholds
    thresholds: {
      minimum: {
        type: Number,
        required: true,
        // Below this = failing
      },
      target: {
        type: Number,
        required: true,
        // Expected performance
      },
      excellent: {
        type: Number,
        required: true,
        // Outstanding performance
      },
    },

    // Weight/importance of this KPI (0-100)
    weight: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },

    // Data source configuration
    dataSource: {
      // Where to get the data from
      type: {
        type: String,
        enum: ["leads", "sales", "attendance", "manual", "custom"],
        default: "manual",
      },
      // For automated tracking
      query: {
        type: mongoose.Schema.Types.Mixed,
        // Stores query config for automated data fetching
      },
    },

    // Is this KPI active?
    isActive: {
      type: Boolean,
      default: true,
    },

    // Who created this KPI template
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },

    // Audit trail
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
    collection: "kpi_definitions",
  },
);

// Update timestamp on save
KPIDefinitionSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
KPIDefinitionSchema.index({ role: 1, isActive: 1 });

module.exports = mongoose.model("KPIDefinition", KPIDefinitionSchema);
