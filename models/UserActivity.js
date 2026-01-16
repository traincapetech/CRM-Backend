const mongoose = require('mongoose');

const UserActivitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true
  },
  sessions: [{
    startTime: {
      type: Date,
      required: true
    },
    endTime: {
      type: Date,
      default: null
    },
    duration: {
      type: Number, // Duration in seconds
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  totalActiveTime: {
    type: Number, // Total time for the day in seconds
    default: 0
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create compound index for efficient queries
UserActivitySchema.index({ userId: 1, date: 1 }, { unique: true });

// Method to add a new session
UserActivitySchema.methods.startSession = function() {
  this.sessions.push({
    startTime: new Date(),
    isActive: true
  });
  this.lastActivity = new Date();
  return this.save();
};

// Method to end the current active session
UserActivitySchema.methods.endCurrentSession = function() {
  const activeSession = this.sessions.find(session => session.isActive);
  if (activeSession) {
    activeSession.endTime = new Date();
    activeSession.duration = Math.floor((activeSession.endTime - activeSession.startTime) / 1000);
    activeSession.isActive = false;
    
    // Update total active time
    this.totalActiveTime += activeSession.duration;
    this.lastActivity = new Date();
  }
  return this.save();
};

// Static method to get or create today's activity record
UserActivitySchema.statics.getTodaysActivity = async function(userId) {
  const today = new Date().toISOString().split('T')[0];
  
  let activity = await this.findOne({ userId, date: today });
  
  if (!activity) {
    activity = new this({
      userId,
      date: today,
      sessions: [],
      totalActiveTime: 0
    });
    await activity.save();
  }
  
  return activity;
};

// Static method to get activity for a specific date range
UserActivitySchema.statics.getActivityByDateRange = async function(userId, startDate, endDate) {
  return this.find({
    userId,
    date: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ date: -1 });
};

module.exports = mongoose.model('UserActivity', UserActivitySchema); 