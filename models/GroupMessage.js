const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema({
  groupId: {
    type: String,
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  },
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
groupMessageSchema.index({ groupId: 1, timestamp: 1 });
groupMessageSchema.index({ senderId: 1 });

module.exports = mongoose.model('GroupMessage', groupMessageSchema); 