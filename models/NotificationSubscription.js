const mongoose = require("mongoose");

const notificationSubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subscription: {
      endpoint: { type: String, required: true },
      expirationTime: { type: Number, default: null },
      keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true },
      },
    },
    deviceType: {
      type: String,
      default: "browser",
    },
  },
  {
    timestamps: true,
  }
);

// Unique index to prevent duplicate subscriptions for the same endpoint
notificationSubscriptionSchema.index({ "subscription.endpoint": 1 }, { unique: true });

module.exports = mongoose.model("NotificationSubscription", notificationSubscriptionSchema);
