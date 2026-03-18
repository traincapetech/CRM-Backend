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
      required: false, // Optional for group messages
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupChat",
      required: false, // Optional for direct messages
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatMessage",
      required: false,
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
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    deliveredAt: {
      type: Date,
    },
    deletedEveryone: {
      type: Boolean,
      default: false,
    },
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editHistory: [
      {
        content: String,
        editedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    reactions: [
      {
        emoji: String,
        users: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Index for efficient querying
chatMessageSchema.index({ chatId: 1, timestamp: 1 });
chatMessageSchema.index({ groupId: 1, timestamp: 1 });
chatMessageSchema.index({ senderId: 1, recipientId: 1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
