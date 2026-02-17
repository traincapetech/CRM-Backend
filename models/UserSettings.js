const mongoose = require("mongoose");

const UserSettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    notifications: {
      email: {
        leaves: { type: Boolean, default: true },
        tasks: { type: Boolean, default: true },
        payroll: { type: Boolean, default: true },
        security: { type: Boolean, default: true },
        marketing: { type: Boolean, default: false },
      },
      inApp: {
        leaves: { type: Boolean, default: true },
        tasks: { type: Boolean, default: true },
        payroll: { type: Boolean, default: true },
        security: { type: Boolean, default: true },
      },
    },
    display: {
      theme: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "system",
      },
      density: {
        type: String,
        enum: ["comfortable", "compact"],
        default: "comfortable",
      },
      sidebarCollapsed: {
        type: Boolean,
        default: false,
      },
    },
    general: {
      timezone: {
        type: String,
        default: "Asia/Kolkata",
      },
      dateFormat: {
        type: String,
        default: "DD/MM/YYYY",
      },
      language: {
        type: String,
        default: "en",
      },
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("UserSettings", UserSettingsSchema);
