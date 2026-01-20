const Test = require('../models/Test');
const TestAssignment = require('../models/TestAssignment');
const TestAttempt = require('../models/TestAttempt');

// @desc    Get test analytics overview
// @route   GET /api/test-reports/overview
// @access  Permission: test.report
exports.getOverview = async (req, res) => {
  const [testCount, assignmentCount, attemptCount] = await Promise.all([
    Test.countDocuments(),
    TestAssignment.countDocuments(),
    TestAttempt.countDocuments()
  ]);

  const scoreStats = await TestAttempt.aggregate([
    { $match: { status: { $in: ['submitted', 'auto_submitted'] } } },
    {
      $group: {
        _id: null,
        avgScore: { $avg: '$score' },
        avgMaxScore: { $avg: '$maxScore' },
        totalViolations: { $sum: { $size: { $ifNull: ['$violations', []] } } }
      }
    }
  ]);

  const stats = scoreStats[0] || { avgScore: 0, avgMaxScore: 0, totalViolations: 0 };
  const avgScorePercent = stats.avgMaxScore > 0 ? Math.round((stats.avgScore / stats.avgMaxScore) * 100) : 0;

  res.status(200).json({
    success: true,
    data: {
      testCount,
      assignmentCount,
      attemptCount,
      avgScorePercent,
      totalViolations: stats.totalViolations
    }
  });
};
