const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastMessage: {
    type: String,
    default: ''
  },
  lastMessageTime: {
    type: Date,
    default: Date.now
  },
  unreadCount: {
    senderId: {
      type: Number,
      default: 0
    },
    recipientId: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Ensure unique chat rooms between two users
chatRoomSchema.index({ senderId: 1, recipientId: 1 }, { unique: true });

// PERFORMANCE OPTIMIZATION: Add indexes for faster queries
chatRoomSchema.index({ senderId: 1, lastMessageTime: -1 });
chatRoomSchema.index({ recipientId: 1, lastMessageTime: -1 });
chatRoomSchema.index({ lastMessageTime: -1 });

module.exports = mongoose.model('ChatRoom', chatRoomSchema); 