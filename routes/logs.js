const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  createLog,
  getLogs,
  getLogStats,
  getLogsByResource,
  cleanupOldLogs
} = require('../controllers/logController');

// All routes need authentication
router.use(protect);

// Create log route - accessible to all authenticated users
router.post('/', createLog);

// Admin only routes
router.use(authorize('Admin'));

// These routes are admin-only
router.get('/', getLogs);
router.get('/stats', getLogStats);
router.get('/resource/:resourceId', getLogsByResource);
router.delete('/cleanup', cleanupOldLogs);

module.exports = router; 