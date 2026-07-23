const mongoose = require("mongoose");

const reviewCycleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please add a review cycle title"],
      trim: true,
    },
    frequency: {
      type: String,
      enum: ["MONTHLY", "QUARTERLY", "ANNUAL", "PROBATION", "CUSTOM"],
      default: "QUARTERLY",
    },
    startDate: {
      type: Date,
      required: [true, "Please specify a start date"],
    },
    endDate: {
      type: Date,
      required: [true, "Please specify an end date"],
    },
    dueDate: {
      type: Date,
      required: [true, "Please specify a due date for completion"],
    },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"],
      default: "ACTIVE",
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReviewTemplate",
      required: [true, "Please select a review template"],
    },
    targetDepartments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "review_cycles",
  }
);

reviewCycleSchema.index({ status: 1 });
reviewCycleSchema.index({ startDate: -1 });

module.exports = mongoose.model("ReviewCycle", reviewCycleSchema);
