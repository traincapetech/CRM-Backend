const Log = require('../models/Log');
const asyncHandler = require('../middleware/async');

// @desc    Create a new log entry
// @route   POST /api/logs
// @access  Private
exports.createLog = asyncHandler(async (req, res) => {
  const log = await Log.create({
    ...req.body,
    performedBy: req.user._id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(201).json({
    success: true,
    data: log
  });
});

// @desc    Get all logs with pagination and filters
// @route   GET /api/logs
// @access  Private/Admin
exports.getLogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const startIndex = (page - 1) * limit;

  let query = {};

  // Add filters if they exist
  if (req.query.action) {
    query.action = req.query.action;
  }
  if (req.query.performedBy) {
    query.performedBy = req.query.performedBy;
  }
  if (req.query.status) {
    query.status = req.query.status;
  }
  if (req.query.affectedResource) {
    query.affectedResource = req.query.affectedResource;
  }
  if (req.query.startDate && req.query.endDate) {
    query.timestamp = {
      $gte: new Date(req.query.startDate),
      $lte: new Date(req.query.endDate)
    };
  }

  // Execute query with pagination
  const logs = await Log.find(query)
    .populate('performedBy', 'fullName email role')
    .sort({ timestamp: -1 })
    .skip(startIndex)
    .limit(limit);

  // Get total count for pagination
  const total = await Log.countDocuments(query);

  res.status(200).json({
    success: true,
    count: logs.length,
    total,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    },
    data: logs
  });
});

// @desc    Get log statistics
// @route   GET /api/logs/stats
// @access  Private/Admin
exports.getLogStats = asyncHandler(async (req, res) => {
  const stats = await Log.aggregate([
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        successCount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0]
          }
        },
        failureCount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'FAILURE'] }, 1, 0]
          }
        }
      }
    }
  ]);

  // Get user activity stats
  const userStats = await Log.aggregate([
    {
      $group: {
        _id: '$performedBy',
        actionCount: { $sum: 1 }
      }
    },
    {
      $sort: { actionCount: -1 }
    },
    {
      $limit: 10
    }
  ]);

  // Get today's logs count
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCount = await Log.countDocuments({
    timestamp: { $gte: today }
  });

  res.status(200).json({
    success: true,
    data: {
      actionStats: stats,
      topUsers: userStats,
      todayCount
    }
  });
});

// @desc    Get logs by resource ID
// @route   GET /api/logs/resource/:resourceId
// @access  Private/Admin
exports.getLogsByResource = asyncHandler(async (req, res) => {
  const logs = await Log.find({ resourceId: req.params.resourceId })
    .populate('performedBy', 'fullName email role')
    .sort({ timestamp: -1 });

  res.status(200).json({
    success: true,
    count: logs.length,
    data: logs
  });
});

// @desc    Delete old logs (older than 30 days)
// @route   DELETE /api/logs/cleanup
// @access  Private/Admin
exports.cleanupOldLogs = asyncHandler(async (req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const result = await Log.deleteMany({
    timestamp: { $lt: thirtyDaysAgo }
  });

  res.status(200).json({
    success: true,
    data: {
      deletedCount: result.deletedCount
    }
  });
}); 