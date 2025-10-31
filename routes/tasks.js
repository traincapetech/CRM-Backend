const express = require('express');
const {
  getTasks,
  createTask,
  updateTask,
  deleteTask
} = require('../controllers/tasks');

const router = express.Router();

const { protect } = require('../middleware/auth');

router
  .route('/')
  .get(protect, getTasks)
  .post(protect, createTask);

router
  .route('/:id')
  .put(protect, updateTask)
  .delete(protect, deleteTask);

module.exports = router;
