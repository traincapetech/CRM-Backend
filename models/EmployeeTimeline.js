const mongoose = require("mongoose");

const employeeTimelineSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: String,
      enum: [
        "EMPLOYMENT",
        "PROFILE",
        "DOCUMENT",
        "SYSTEM",
        "PAYROLL",
        "PERFORMANCE",
        "ASSETS",
        "REVIEWS",
        "INCREMENTS",
      ],
      default: "EMPLOYMENT",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

employeeTimelineSchema.index({ employeeId: 1, timestamp: -1 });

/**
 * Static helper method to publish timeline events cleanly from any module
 */
employeeTimelineSchema.statics.logEvent = async function ({
  employeeId,
  eventType,
  title,
  description = "",
  category = "EMPLOYMENT",
  metadata = {},
  performedBy,
}) {
  try {
    return await this.create({
      employeeId,
      eventType,
      title,
      description,
      category,
      metadata,
      performedBy,
    });
  } catch (error) {
    console.error("Error logging EmployeeTimeline event:", error);
    return null;
  }
};

module.exports = mongoose.model("EmployeeTimeline", employeeTimelineSchema);
