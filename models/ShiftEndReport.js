const mongoose = require("mongoose");

const ShiftEndReportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    role: {
      type: String,
      required: [true, "Role is required"],
      trim: true,
    },
    department: {
      type: String,
      trim: true,
      default: "General",
    },
    date: {
      type: Date,
      default: Date.now,
      required: true,
    },
    dateKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    // Role-specific metrics payload
    metrics: {
      // Lead Person metrics
      linkedinPolls: { type: Number, default: 0 },
      whatsappPolls: { type: Number, default: 0 },
      noOfGroups: { type: Number, default: 0 },
      leadsDaily: { type: Number, default: 0 },
      salesCount: { type: Number, default: 0 },
      salesRevenue: { type: Number, default: 0 },

      // Sales Person metrics
      noOfGroupsAssigned: { type: Number, default: 0 },
      callsMade: { type: Number, default: 0 },
      followupsDone: { type: Number, default: 0 },

      // Digital Marketing Intern / Permanent metrics
      creativesDesigned: { type: Number, default: 0 },
      postsReelsPublished: { type: Number, default: 0 },
      adCampaignsManaged: { type: Number, default: 0 },
      adSpendReported: { type: Number, default: 0 },
      adSpendCurrency: { type: String, default: "INR" },
      marketingLeadsGenerated: { type: Number, default: 0 },
      seoTasksCompleted: { type: Number, default: 0 },
      engagementReplies: { type: Number, default: 0 },
      costPerLead: { type: Number, default: 0 },
      keyLearningsAndBlockers: { type: String, default: "" },

      // IT & Operations metrics (Numbers only)
      tasksCompleted: { type: Number, default: 0 },
      bugsResolved: { type: Number, default: 0 },
      commitsPushed: { type: Number, default: 0 },
      hoursWorked: { type: Number, default: 0 },
    },
    // General notes / comments
    summaryNotes: {
      type: String,
      default: "",
    },
    // Exact formatted text ready for WhatsApp / Telegram
    formattedText: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["Submitted", "Reviewed", "Draft"],
      default: "Submitted",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewNotes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// One report per user per day
ShiftEndReportSchema.index({ user: 1, dateKey: 1 }, { unique: true });
ShiftEndReportSchema.index({ role: 1, dateKey: 1 });
ShiftEndReportSchema.index({ date: -1 });

module.exports = mongoose.model("ShiftEndReport", ShiftEndReportSchema);

