const mongoose = require("mongoose");

const StepStateSchema = new mongoose.Schema({
  stepId: {
    type: String, // Corresponds to template stepId
    required: true,
  },
  status: {
    type: String,
    enum: ["LOCKED", "PENDING", "IN_PROGRESS", "COMPLETED", "SKIPPED"],
    default: "LOCKED",
  },
  assignedToUser: {
    // Resolved User ID
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  assignedAt: Date,
  completedAt: Date,
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  feedActionId: {
    // Reference to the ActionItem created for this step
    type: mongoose.Schema.Types.ObjectId,
    ref: "ActionItem",
  },
  data: mongoose.Schema.Types.Mixed, // Any data collected in this step
});

const JourneyInstanceSchema = new mongoose.Schema(
  {
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JourneyTemplate",
      required: true,
    },
    employeeId: {
      // The subject of the journey
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "CANCELLED"],
      default: "ACTIVE",
    },
    currentSteps: [String], // IDs of steps currently 'PENDING' or 'IN_PROGRESS'
    steps: [StepStateSchema],
    percentageComplete: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Index for finding active journeys for an employee
JourneyInstanceSchema.index({ employeeId: 1, status: 1 });

module.exports = mongoose.model("JourneyInstance", JourneyInstanceSchema);
