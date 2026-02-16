const mongoose = require("mongoose");
const { Schema } = mongoose;

// Message Types

const MESSAGE_TYPES = ["TEXT", "IMAGE", "FILE", "SYSTEM"];

// Schema

const ticketChatSchema = new Schema(
  {
    // Ticket reference
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
      required: true,
      index: true,
    },

    // Who sent the message
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Message type
    messageType: {
      type: String,
      enum: MESSAGE_TYPES,
      default: "TEXT",
    },

    // Text message (if TEXT)
    message: {
      type: String,
      trim: true,
    },

    // Attachments
    attachments: [
      {
        url: String,
        fileType: String,
        fileName: String,
      },
    ],

    // Read receipts
    readBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Edited flag
    isEdited: {
      type: Boolean,
      default: false,
    },

    editedAt: {
      type: Date,
      default: null,
    },

    // Soft delete (optional)
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes (Important for performance)

// Fast ticket chat loading
ticketChatSchema.index({ ticketId: 1, createdAt: 1 });

// Fast sender-based queries
ticketChatSchema.index({ sender: 1 });

// Instance Methods

// Mark message as read
ticketChatSchema.methods.markAsRead = function (userId) {
  if (!this.readBy.includes(userId)) {
    this.readBy.push(userId);
  }
};

// Edit message
ticketChatSchema.methods.editMessage = function (newMessage) {
  this.message = newMessage;
  this.isEdited = true;
  this.editedAt = new Date();
};

// Soft delete message
ticketChatSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.message = "This message was deleted";
};

// Static Methods

// Get chat history for ticket (paginated)
ticketChatSchema.statics.getTicketChat = async function (
  ticketId,
  page = 1,
  limit = 20,
) {
  const skip = (page - 1) * limit;

  return this.find({ ticketId })
    .populate("sender", "name role")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Export

module.exports = mongoose.model("TicketChat", ticketChatSchema);
