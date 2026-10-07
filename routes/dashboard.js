const express = require('express');
const router = express.Router();
const { getDashboardSummary } = require('../controllers/dashboard');
const { protect } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');

// All routes require authentication
router.use(protect);

// GET /api/dashboard/summary - Fast, memory-efficient aggregated dashboard metrics
router.get('/summary', cacheMiddleware(60), getDashboardSummary);

module.exports = router;
