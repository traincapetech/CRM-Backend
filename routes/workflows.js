/**
 * Workflow Routes
 */

const express = require('express');
const router = express.Router();
const {
  getWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  executeWorkflow,
  getWorkflowStats
} = require('../controllers/workflows');

const { protect, authorize } = require('../middleware/auth');
const { cacheMiddleware, invalidateCache } = require('../middleware/cache');

// All routes require authentication
router.use(protect);

// Get all workflows
router.get('/', authorize('Admin', 'Manager'), cacheMiddleware(300), getWorkflows);

// Get single workflow
router.get('/:id', authorize('Admin', 'Manager'), getWorkflow);

// Create workflow
router.post('/', authorize('Admin', 'Manager'), invalidateCache(['cache:/api/workflows*']), createWorkflow);

// Update workflow
router.put('/:id', authorize('Admin', 'Manager'), invalidateCache(['cache:/api/workflows*']), updateWorkflow);

// Delete workflow
router.delete('/:id', authorize('Admin', 'Manager'), invalidateCache(['cache:/api/workflows*']), deleteWorkflow);

// Execute workflow manually
router.post('/:id/execute', authorize('Admin', 'Manager'), executeWorkflow);

// Get workflow statistics
router.get('/:id/stats', authorize('Admin', 'Manager'), getWorkflowStats);

module.exports = router;

