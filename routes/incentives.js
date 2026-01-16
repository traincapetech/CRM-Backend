const express = require('express');
const {
  createIncentive,
  getIncentives,
  getIncentive,
  updateIncentive,
  approveIncentive,
  rejectIncentive,
  addComment,
  deleteIncentive,
  getIncentiveStats,
  uploadIncentiveFiles
} = require('../controllers/incentives');

const router = express.Router();
const { protect } = require('../middleware/auth');

// Protect all routes
router.use(protect);

// Incentive management routes
router.get('/stats', getIncentiveStats);
router.post('/', uploadIncentiveFiles, createIncentive);
router.get('/', getIncentives);
router.get('/:id', getIncentive);
router.put('/:id', updateIncentive);
router.delete('/:id', deleteIncentive);

// Incentive approval routes
router.put('/:id/approve', approveIncentive);
router.put('/:id/reject', rejectIncentive);

// Comment routes
router.post('/:id/comments', addComment);

module.exports = router; 