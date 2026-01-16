const express = require('express');
const {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  logTime,
  updateEstimate,
  addDependency,
  removeDependency
} = require('../controllers/tasks');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router
  .route('/')
  .get(protect, getTasks)
  .post(protect, createTask);

router
  .route('/:id')
  .put(protect, updateTask)
  .delete(protect, deleteTask);

// Time tracking
router.post('/:id/time', protect, logTime);

// Estimates and story points
router.put('/:id/estimate', protect, authorize('Admin', 'Manager', 'IT Manager'), updateEstimate);

// Dependencies
router.post('/:id/dependencies', protect, authorize('Admin', 'Manager', 'IT Manager'), addDependency);
router.delete('/:id/dependencies/:dependsOnId', protect, authorize('Admin', 'Manager', 'IT Manager'), removeDependency);

module.exports = router;
