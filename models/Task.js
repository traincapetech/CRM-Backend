const mongoose = require("mongoose");

const TaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      maxlength: [100, "Title cannot be more than 100 characters"],
      default: "Scheduled Exam",
    },
    description: {
      type: String,
      default: "",
    },
    assignedTo: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    assignedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    department: {
      type: String,
      enum: ["IT", "Sales", "HR", "Admin"],
      default: "Sales",
    },
    taskType: {
      type: String,
      enum: ["Task", "Exam", "Meeting", "Call"],
      default: "Task",
    },
    course: String,
    examDate: Date,
    examDateTime: Date,
    location: String,
    examLink: String,
    salesPerson: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    customer: {
      type: mongoose.Schema.ObjectId,
      ref: "Lead",
    },
    manualCustomer: {
      name: String,
      email: String,
      contactNumber: String,
      course: String,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: [
        "Pending",
        "In Progress",
        "Partially Completed",
        "Employee Completed",
        "Manager Confirmed",
        "Not Completed",
      ],
      default: "Pending",
    },
    // Agile fields
    storyPoints: {
      type: Number,
      min: 0,
      default: 0,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    // Time tracking
    estimatedHours: {
      type: Number,
      min: 0,
      default: 0,
    },
    loggedHours: {
      type: Number,
      min: 0,
      default: 0,
    },
    timeEntries: [
      {
        date: Date,
        hours: Number,
        description: String,
        loggedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    // Task dependencies
    dependencies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
      },
    ],
    blocks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
      },
    ],
    // Project association
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ITProject",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
    confirmedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Task", TaskSchema);
