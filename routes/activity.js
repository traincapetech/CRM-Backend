const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const UserActivity = require('../models/UserActivity');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Special middleware for sendBeacon requests (no custom headers)
const protectBeacon = async (req, res, next) => {
  let token;

  // Try to get token from Authorization header first
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // If no header, try to get from body (for sendBeacon)
  else if (req.body && req.body.token) {
    token = req.body.token;
  }

  // Make sure token exists
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from token
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'No user found with this token'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};

// Start a new activity session
router.post('/start-session', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get or create today's activity record
    const activity = await UserActivity.getTodaysActivity(userId);
    
    // End any existing active session first
    await activity.endCurrentSession();
    
    // Start new session
    await activity.startSession();
    
    res.json({
      success: true,
      message: 'Activity session started',
      data: {
        sessionStarted: true,
        totalActiveTime: activity.totalActiveTime
      }
    });
  } catch (error) {
    console.error('Error starting activity session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start activity session',
      error: error.message
    });
  }
});

// End current activity session
router.post('/end-session', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { duration } = req.body; // Duration in seconds from frontend
    
    // Get today's activity record
    const activity = await UserActivity.getTodaysActivity(userId);
    
    // If there's an active session, end it
    const activeSession = activity.sessions.find(session => session.isActive);
    if (activeSession) {
      activeSession.endTime = new Date();
      
      // Use frontend duration if provided, otherwise calculate
      if (duration && duration > 0) {
        activeSession.duration = Math.floor(duration);
      } else {
        activeSession.duration = Math.floor((activeSession.endTime - activeSession.startTime) / 1000);
      }
      
      activeSession.isActive = false;
      activity.totalActiveTime += activeSession.duration;
      activity.lastActivity = new Date();
      
      await activity.save();
    }
    
    res.json({
      success: true,
      message: 'Activity session ended',
      data: {
        sessionEnded: true,
        totalActiveTime: activity.totalActiveTime,
        sessionDuration: activeSession ? activeSession.duration : 0
      }
    });
  } catch (error) {
    console.error('Error ending activity session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end activity session',
      error: error.message
    });
  }
});

// Special endpoint for sendBeacon requests (handles token in body)
router.post('/end-session-beacon', protectBeacon, async (req, res) => {
  try {
    const userId = req.user._id;
    const { duration } = req.body; // Duration in seconds from frontend
    
    // Get today's activity record
    const activity = await UserActivity.getTodaysActivity(userId);
    
    // If there's an active session, end it
    const activeSession = activity.sessions.find(session => session.isActive);
    if (activeSession) {
      activeSession.endTime = new Date();
      
      // Use frontend duration if provided, otherwise calculate
      if (duration && duration > 0) {
        activeSession.duration = Math.floor(duration);
      } else {
        activeSession.duration = Math.floor((activeSession.endTime - activeSession.startTime) / 1000);
      }
      
      activeSession.isActive = false;
      activity.totalActiveTime += activeSession.duration;
      activity.lastActivity = new Date();
      
      await activity.save();
    }
    
    res.json({
      success: true,
      message: 'Activity session ended via beacon',
      data: {
        sessionEnded: true,
        totalActiveTime: activity.totalActiveTime,
        sessionDuration: activeSession ? activeSession.duration : 0
      }
    });
  } catch (error) {
    console.error('Error ending activity session via beacon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end activity session via beacon',
      error: error.message
    });
  }
});

// Track activity (for periodic updates)
router.post('/track', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { duration, isActive = true } = req.body;
    
    if (!duration || duration <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid duration is required'
      });
    }
    
    // Get today's activity record
    const activity = await UserActivity.getTodaysActivity(userId);
    
    // Update last activity time
    activity.lastActivity = new Date();
    
    // If there's an active session, update it
    const activeSession = activity.sessions.find(session => session.isActive);
    if (activeSession && isActive) {
      // Session is still active, just update last activity
      await activity.save();
    } else if (!isActive && activeSession) {
      // Session should be ended
      await activity.endCurrentSession();
    }
    
    res.json({
      success: true,
      message: 'Activity tracked',
      data: {
        totalActiveTime: activity.totalActiveTime,
        isActive: !!activeSession
      }
    });
  } catch (error) {
    console.error('Error tracking activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track activity',
      error: error.message
    });
  }
});

// Get user's own activity data
router.get('/my-activity', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { date, startDate, endDate } = req.query;
    
    let activities;
    
    if (date) {
      // Get activity for specific date
      activities = await UserActivity.findOne({ userId, date });
    } else if (startDate && endDate) {
      // Get activity for date range
      activities = await UserActivity.getActivityByDateRange(userId, startDate, endDate);
    } else {
      // Get today's activity
      const today = new Date().toISOString().split('T')[0];
      activities = await UserActivity.findOne({ userId, date: today });
    }
    
    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity data',
      error: error.message
    });
  }
});

// Get all users' activity data (Admin/Manager only)
router.get('/all-users', protect, authorize('Admin', 'Manager'), async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const targetDate = date || today;
    
    let activities;
    
    if (startDate && endDate) {
      // Get activities for date range
      activities = await UserActivity.find({
        date: { $gte: startDate, $lte: endDate }
      }).populate('userId', 'fullName email role').sort({ date: -1, totalActiveTime: -1 });
    } else {
      // Get activities for specific date (default today)
      activities = await UserActivity.find({ date: targetDate })
        .populate('userId', 'fullName email role')
        .sort({ totalActiveTime: -1 });
    }
    
    // Format the response
    const formattedActivities = activities.map(activity => ({
      userId: activity.userId._id,
      userName: activity.userId.fullName,
      userEmail: activity.userId.email,
      userRole: activity.userId.role,
      date: activity.date,
      totalActiveTime: activity.totalActiveTime,
      totalActiveTimeFormatted: formatDuration(activity.totalActiveTime),
      sessionsCount: activity.sessions.length,
      lastActivity: activity.lastActivity,
      isCurrentlyActive: activity.sessions.some(session => session.isActive)
    }));
    
    res.json({
      success: true,
      data: formattedActivities,
      summary: {
        totalUsers: formattedActivities.length,
        activeUsers: formattedActivities.filter(a => a.isCurrentlyActive).length,
        totalActiveTime: formattedActivities.reduce((sum, a) => sum + a.totalActiveTime, 0),
        averageActiveTime: formattedActivities.length > 0 
          ? Math.floor(formattedActivities.reduce((sum, a) => sum + a.totalActiveTime, 0) / formattedActivities.length)
          : 0
      }
    });
  } catch (error) {
    console.error('Error fetching all users activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users activity data',
      error: error.message
    });
  }
});

// Get activity statistics (Admin/Manager only)
router.get('/statistics', protect, authorize('Admin', 'Manager'), async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Get all activities in the date range
    const activities = await UserActivity.find({
      date: { $gte: startDate, $lte: endDate }
    }).populate('userId', 'fullName email role');
    
    // Group by date
    const dailyStats = {};
    const userStats = {};
    
    activities.forEach(activity => {
      // Daily statistics
      if (!dailyStats[activity.date]) {
        dailyStats[activity.date] = {
          date: activity.date,
          totalUsers: 0,
          totalActiveTime: 0,
          averageActiveTime: 0
        };
      }
      dailyStats[activity.date].totalUsers++;
      dailyStats[activity.date].totalActiveTime += activity.totalActiveTime;
      
      // User statistics
      const userId = activity.userId._id.toString();
      if (!userStats[userId]) {
        userStats[userId] = {
          userId: activity.userId._id,
          userName: activity.userId.fullName,
          userEmail: activity.userId.email,
          userRole: activity.userId.role,
          totalDays: 0,
          totalActiveTime: 0,
          averageActiveTime: 0
        };
      }
      userStats[userId].totalDays++;
      userStats[userId].totalActiveTime += activity.totalActiveTime;
    });
    
    // Calculate averages
    Object.values(dailyStats).forEach(day => {
      day.averageActiveTime = day.totalUsers > 0 ? Math.floor(day.totalActiveTime / day.totalUsers) : 0;
      day.totalActiveTimeFormatted = formatDuration(day.totalActiveTime);
      day.averageActiveTimeFormatted = formatDuration(day.averageActiveTime);
    });
    
    Object.values(userStats).forEach(user => {
      user.averageActiveTime = user.totalDays > 0 ? Math.floor(user.totalActiveTime / user.totalDays) : 0;
      user.totalActiveTimeFormatted = formatDuration(user.totalActiveTime);
      user.averageActiveTimeFormatted = formatDuration(user.averageActiveTime);
    });
    
    res.json({
      success: true,
      data: {
        dailyStats: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date)),
        userStats: Object.values(userStats).sort((a, b) => b.totalActiveTime - a.totalActiveTime),
        period: {
          startDate,
          endDate,
          days: parseInt(days)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching activity statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity statistics',
      error: error.message
    });
  }
});

// Helper function to format duration
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0m';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

module.exports = router; 