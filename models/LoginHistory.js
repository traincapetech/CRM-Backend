const mongoose = require("mongoose");

const LoginHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  ipAddress: {
    type: String,
    required: true,
  },
  userAgent: {
    type: String,
    required: true,
  },
  deviceType: {
    type: String,
    default: "Unknown",
  },
  browser: {
    type: String,
    default: "Unknown",
  },
  os: {
    type: String,
    default: "Unknown",
  },
  location: {
    type: String,
    default: "Unknown",
  },
  status: {
    type: String,
    enum: ["SUCCESS", "FAILED"],
    required: true,
  },
  failureReason: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 90, // Auto-delete documents after 90 days
  },
});

// Index for efficient querying by user and time
LoginHistorySchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model("LoginHistory", LoginHistorySchema);
