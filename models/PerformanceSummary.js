const mongoose = require("mongoose");

const PerformanceSummarySchema = new mongoose.Schema(
  {
    // Which employee
    employeeId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
      unique: true, // One summary per employee
    },

    // Current performance snapshot
    currentRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // Rating tier
    ratingTier: {
      type: String,
      enum: ["excellent", "good", "average", "below-average", "poor"],
      default: "average",
    },

    // Star rating (1-5)
    stars: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },

    // Performance streak
    streak: {
      type: {
        type: String,
        enum: ["positive", "negative", "neutral"],
      },
      days: {
        type: Number,
        default: 0,
      },
      description: String, // e.g., "5 days above target"
    },

    // Rolling averages
    averages: {
      last7Days: Number,
      last30Days: Number,
      last90Days: Number,
      thisMonth: Number,
      thisQuarter: Number,
    },

    // Warning flags
    warnings: [
      {
        date: Date,
        reason: String,
        kpi: String,
        severity: {
          type: String,
          enum: ["low", "medium", "high"],
        },
      },
    ],

    // PIP status
    isPIP: {
      type: Boolean,
      default: false,
    },

    pipDetails: {
      startDate: Date,
      endDate: Date,
      pipId: {
        type: mongoose.Schema.ObjectId,
        ref: "PIP",
      },
    },

    // 9-Box Matrix positioning
    nineBoxMatrix: {
      performance: {
        type: String,
        enum: ["low", "medium", "high"],
      },
      potential: {
        type: String,
        enum: ["low", "medium", "high"],
      },
      category: String, // e.g., "High Potential, High Performance"
    },

    // Goals tracking
    goalsProgress: {
      totalGoals: {
        type: Number,
        default: 0,
      },
      completedGoals: {
        type: Number,
        default: 0,
      },
      completionPercentage: {
        type: Number,
        default: 0,
      },
    },

    // Last review info
    lastReview: {
      date: Date,
      rating: Number,
      reviewId: {
        type: mongoose.Schema.ObjectId,
        ref: "PerformanceReview",
      },
    },

    // Next review scheduled
    nextReview: {
      date: Date,
      type: String, // "probation", "quarterly", "annual"
    },

    // Audit trail
    lastCalculated: {
      type: Date,
      default: Date.now,
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
    collection: "performance_summaries",
  },
);

// Update timestamp on save
PerformanceSummarySchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes
PerformanceSummarySchema.index({ employeeId: 1 });
PerformanceSummarySchema.index({ isPIP: 1 });
PerformanceSummarySchema.index({
  "nineBoxMatrix.performance": 1,
  "nineBoxMatrix.potential": 1,
});
PerformanceSummarySchema.index({ currentRating: -1 });

module.exports = mongoose.model("PerformanceSummary", PerformanceSummarySchema);
