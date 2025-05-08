const Task = require('../models/Task');
const User = require('../models/User');
const Lead = require('../models/Lead');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// @desc    Create new task
// @route   POST /api/tasks
// @access  Private
exports.createTask = asyncHandler(async (req, res, next) => {
  // Add creator as sales person
  req.body.salesPerson = req.user.id;

  const task = await Task.create(req.body);
  
  res.status(201).json({
    success: true,
    data: task
  });
});

// @desc    Get all tasks
// @route   GET /api/tasks
// @access  Private
exports.getTasks = asyncHandler(async (req, res, next) => {
  // For non-admin users, only show their own tasks
  let query;
  
  // If user is not admin or manager, only show their tasks
  if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
    query = Task.find({ salesPerson: req.user.id });
  } else {
    query = Task.find();
  }
  
  // Execute query with populated fields
  const tasks = await query
    .populate({
      path: 'salesPerson',
      select: 'fullName email'
    })
    .populate({
      path: 'customer',
      select: 'name NAME email E-MAIL contactNumber phone MOBILE country'
    });
  
  res.status(200).json({
    success: true,
    count: tasks.length,
    data: tasks
  });
});

// @desc    Get single task
// @route   GET /api/tasks/:id
// @access  Private
exports.getTask = asyncHandler(async (req, res, next) => {
  const task = await Task.findById(req.params.id)
    .populate({
      path: 'salesPerson',
      select: 'fullName email'
    })
    .populate({
      path: 'customer',
      select: 'name NAME email E-MAIL contactNumber phone MOBILE country'
    });
  
  if (!task) {
    return next(new ErrorResponse(`Task not found with id of ${req.params.id}`, 404));
  }
  
  // Make sure user is task owner or admin/manager
  if (task.salesPerson._id.toString() !== req.user.id && 
      req.user.role !== 'Admin' && 
      req.user.role !== 'Manager') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to access this task`, 401));
  }
  
  res.status(200).json({
    success: true,
    data: task
  });
});

// @desc    Update task
// @route   PUT /api/tasks/:id
// @access  Private
exports.updateTask = asyncHandler(async (req, res, next) => {
  let task = await Task.findById(req.params.id);
  
  if (!task) {
    return next(new ErrorResponse(`Task not found with id of ${req.params.id}`, 404));
  }
  
  // Make sure user is task owner or admin/manager
  if (task.salesPerson.toString() !== req.user.id && 
      req.user.role !== 'Admin' && 
      req.user.role !== 'Manager') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this task`, 401));
  }
  
  req.body.updatedAt = Date.now();
  
  task = await Task.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  
  res.status(200).json({
    success: true,
    data: task
  });
});

// @desc    Delete task
// @route   DELETE /api/tasks/:id
// @access  Private
exports.deleteTask = asyncHandler(async (req, res, next) => {
  const task = await Task.findById(req.params.id);
  
  if (!task) {
    return next(new ErrorResponse(`Task not found with id of ${req.params.id}`, 404));
  }
  
  // Make sure user is task owner or admin/manager
  if (task.salesPerson.toString() !== req.user.id && 
      req.user.role !== 'Admin' && 
      req.user.role !== 'Manager') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to delete this task`, 401));
  }
  
  await task.deleteOne();
  
  res.status(200).json({
    success: true,
    data: {}
  });
}); 