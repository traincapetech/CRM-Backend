const mongoose = require("mongoose");

const ActionItemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["APPROVAL", "TASK", "INSIGHT", "FORM_INPUT", "INFO", "WARNING"], // Expanded based on arch doc
      required: true,
    },
    module: {
      type: String,
      enum: ["CRM", "HR", "IT", "LMS", "FINANCE", "JOURNEY"],
      required: true,
    },

    title: {
      type: String,
    },
    subtitle: {
      type: String,
    },

    // The 'pointer' to the source of truth
    sourceCollection: {
      type: String, // e.g., 'Leave', 'Ticket', 'Lead'
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
    },

    priority: {
      type: Number,
      default: 1, // 0=Low, 1=Med, 2=High, 3=Critical
      min: 0,
      max: 3,
    },

    // JSON payload for UI rendering (Action Objects)
    // Contains buttons, links, or specific UI component names
    actionsPayload: {
      type: mongoose.Schema.Types.Mixed,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
    isActioned: {
      type: Boolean,
      default: false,
    },

    // Auto-cleanup for older items
    expiresAt: {
      type: Date,
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: true },
);

// Compound index for fast feed retrieval: User's active high-priority items first
ActionItemSchema.index({
  userId: 1,
  isActioned: 1,
  priority: -1,
  createdAt: -1,
});

module.exports = mongoose.model("ActionItem", ActionItemSchema);
