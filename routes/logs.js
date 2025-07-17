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

router.use(protect); // All log routes are protected

// Admin only routes
router.use(authorize('Admin'));

router
  .route('/')
  .get(getLogs)
  .post(createLog);

router.get('/stats', getLogStats);
router.get('/resource/:resourceId', getLogsByResource);
router.delete('/cleanup', cleanupOldLogs);

module.exports = router; 