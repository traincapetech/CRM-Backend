const express = require('express');
const {
  createTask,
  getTasks,
  getTask,
  updateTask,
  deleteTask
} = require('../controllers/taskController');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

// Apply authentication to all routes
router.use(protect);

// Routes for tasks
router.route('/')
  .get(getTasks)
  .post(authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), createTask);

router.route('/:id')
  .get(getTask)
  .put(authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), updateTask)
  .delete(authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), deleteTask);

module.exports = router; 