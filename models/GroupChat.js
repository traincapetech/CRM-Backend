const mongoose = require('mongoose');

const groupChatSchema = new mongoose.Schema({
  groupId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  groupName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  lastMessage: {
    type: String,
    default: ''
  },
  lastMessageTime: {
    type: Date,
    default: Date.now
  },
  lastMessageSender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  avatar: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
groupChatSchema.index({ 'members.userId': 1 });
groupChatSchema.index({ isActive: 1, lastMessageTime: -1 });

module.exports = mongoose.model('GroupChat', groupChatSchema); 