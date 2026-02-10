const mongoose = require("mongoose");

const StepSchema = new mongoose.Schema({
  stepId: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: String,
  type: {
    type: String,
    enum: ["TASK", "APPROVAL", "FORM", "INFO"],
    default: "TASK",
  },
  assigneeRole: {
    // Who needs to perform this? 'SELF', 'MANAGER', 'HR', 'IT_ADMIN'
    type: String,
    required: true,
  },
  dependencyStepIds: [String], // Steps that must be completed before this one unlocks
  slaDays: {
    type: Number,
    default: 3,
  },
  actionConfig: {
    // Configuration for what happens when this step is triggered/completed
    feedActionTitle: String,
    feedActionSubtitle: String,
    uiLink: String, // Where the user goes to do this
    requiredFields: [String], // If type is FORM, what fields are needed (simplified)
  },
});

const JourneyTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    description: String,
    category: {
      type: String,
      enum: ["ONBOARDING", "OFFBOARDING", "PROMOTION", "TRANSFER", "OTHER"],
      default: "OTHER",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    triggerEvent: String, // e.g., 'EMPLOYEE_CREATED', 'LIFECYCLE_CHANGE'
    steps: [StepSchema],
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("JourneyTemplate", JourneyTemplateSchema);
