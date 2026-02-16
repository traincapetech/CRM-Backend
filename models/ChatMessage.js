const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    chatId: {
      type: String,
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: false, // Content is optional if there are attachments
      trim: true,
    },
    attachments: [
      {
        url: String,
        fileType: String, // 'image', 'video', 'document'
        fileName: String,
        fileSize: Number,
      },
    ],
    messageType: {
      type: String,
      enum: ["text", "image", "file", "audio", "video"],
      default: "text",
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Index for efficient querying
chatMessageSchema.index({ chatId: 1, timestamp: 1 });
chatMessageSchema.index({ senderId: 1, recipientId: 1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
