const mongoose = require('mongoose');

const groupChatSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  avatar: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member'
    }
  }],
  lastMessage: {
    content: String,
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  settings: {
    allowMemberInvite: {
      type: Boolean,
      default: false
    },
    muteNotifications: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Index for efficient querying
groupChatSchema.index({ 'members.user': 1 });
groupChatSchema.index({ createdBy: 1 });
groupChatSchema.index({ isActive: 1 });

module.exports = mongoose.model('GroupChat', groupChatSchema); 