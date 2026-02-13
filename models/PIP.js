const mongoose = require("mongoose");

const PIPSchema = new mongoose.Schema(
  {
    // Which employee is on PIP
    employeeId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },

    // PIP status
    status: {
      type: String,
      enum: [
        "active",
        "completed-success",
        "completed-failure",
        "extended",
        "cancelled",
      ],
      default: "active",
    },

    // Why was this PIP triggered?
    triggerReason: {
      type: String,
      required: true,
    },

    // Automatic or manual trigger?
    isAutomatic: {
      type: Boolean,
      default: false,
    },

    // PIP timeline
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    endDate: {
      type: Date,
      required: true,
    },

    duration: {
      type: Number, // days
      required: true,
      default: 30,
    },

    // Performance improvement goals
    goals: [
      {
        kpiId: {
          type: mongoose.Schema.ObjectId,
          ref: "KPIDefinition",
        },
        kpiName: String,
        currentPerformance: Number,
        targetPerformance: Number,
        deadline: Date,
        status: {
          type: String,
          enum: ["not-started", "in-progress", "achieved", "not-achieved"],
          default: "not-started",
        },
      },
    ],

    // Weekly reviews by manager
    weeklyReviews: [
      {
        weekNumber: Number,
        reviewDate: Date,
        reviewerId: {
          type: mongoose.Schema.ObjectId,
          ref: "User",
        },
        progress: {
          type: String,
          enum: ["improving", "stagnant", "declining"],
        },
        score: Number, // Performance score for that week
        notes: String,
        managerFeedback: String,
      },
    ],

    // Support provided
    support: {
      training: [String], // Training modules assigned
      mentorship: {
        mentorId: {
          type: mongoose.Schema.ObjectId,
          ref: "User",
        },
        sessions: Number,
      },
      resources: [String], // Documents, guides, etc.
    },

    // Outcome
    outcome: {
      result: {
        type: String,
        enum: ["success", "failure", "extension", "cancelled"],
      },
      closedDate: Date,
      closedBy: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
      },
      finalNotes: String,
      finalScore: Number,
    },

    // Assigned manager/reviewer
    assignedManager: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },

    // HR visibility
    hrNotes: String,

    // Notifications sent
    notifications: [
      {
        type: String,
        sentAt: Date,
        recipient: String,
      },
    ],

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
    collection: "pips",
  },
);

// Update timestamp on save
PIPSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes
PIPSchema.index({ employeeId: 1, status: 1 });
PIPSchema.index({ status: 1, endDate: 1 });
PIPSchema.index({ assignedManager: 1, status: 1 });

module.exports = mongoose.model("PIP", PIPSchema);
