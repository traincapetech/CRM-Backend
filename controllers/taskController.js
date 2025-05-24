const Task = require('../models/Task');
const User = require('../models/User');
const Lead = require('../models/Lead');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// Common customer field selection for populating lead data
const CUSTOMER_SELECT_FIELDS = 'name NAME email E-MAIL contactNumber phone MOBILE NUMBER country customerName fullName course COURSE';

// @desc    Create new task
// @route   POST /api/tasks
// @access  Private
exports.createTask = asyncHandler(async (req, res, next) => {
  // Add creator as sales person
  req.body.salesPerson = req.user.id;

  // Validate that either customer or manualCustomer is provided
  if (!req.body.customer && !req.body.manualCustomer) {
    return next(new ErrorResponse('Either customer ID or manual customer details must be provided', 400));
  }

  // If manualCustomer is provided, validate required fields
  if (req.body.manualCustomer) {
    const { name, contactNumber, course } = req.body.manualCustomer;
    if (!name || !contactNumber || !course) {
      return next(new ErrorResponse('Manual customer requires name, contact number, and course', 400));
    }
  }

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
      select: CUSTOMER_SELECT_FIELDS
    });
    
  // Process the tasks to handle the customer display consistently
  const processedTasks = tasks.map(task => {
    const taskObj = task.toObject();
    
    // If this is a manual customer entry (no customer ID but has manualCustomer data)
    if (!taskObj.customer && taskObj.manualCustomer) {
      // Create a consistent customer field from manualCustomer for the frontend
      taskObj.customer = {
        _id: 'manual',
        name: taskObj.manualCustomer.name,
        email: taskObj.manualCustomer.email,
        contactNumber: taskObj.manualCustomer.contactNumber,
        course: taskObj.manualCustomer.course,
        isManualEntry: true
      };
    }
    
    return taskObj;
  });
  
  res.status(200).json({
    success: true,
    count: processedTasks.length,
    data: processedTasks
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
      select: CUSTOMER_SELECT_FIELDS
    });
  
  if (!task) {
    return next(new ErrorResponse(`Task not found with id of ${req.params.id}`, 404));
  }
  
  // Allow any user to view tasks (removing permission restrictions)
  // This enables everyone to see all scheduled exams
  
  // Process the task to handle manual customer consistently
  const taskObj = task.toObject();
  
  // If this is a manual customer entry (no customer ID but has manualCustomer data)
  if (!taskObj.customer && taskObj.manualCustomer) {
    // Create a consistent customer field from manualCustomer for the frontend
    taskObj.customer = {
      _id: 'manual',
      name: taskObj.manualCustomer.name,
      email: taskObj.manualCustomer.email,
      contactNumber: taskObj.manualCustomer.contactNumber,
      course: taskObj.manualCustomer.course,
      isManualEntry: true
    };
  }
  
  res.status(200).json({
    success: true,
    data: taskObj
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
  
  // Allow any user to update tasks (removing permission restrictions)
  // This enables team collaboration on exam scheduling
  
  // Validate that either customer or manualCustomer is provided
  if (req.body.customer === '' && !req.body.manualCustomer) {
    return next(new ErrorResponse('Either customer ID or manual customer details must be provided', 400));
  }

  // If manualCustomer is provided, validate required fields
  if (req.body.manualCustomer) {
    const { name, contactNumber, course } = req.body.manualCustomer;
    if (!name || !contactNumber || !course) {
      return next(new ErrorResponse('Manual customer requires name, contact number, and course', 400));
    }
  }
  
  req.body.updatedAt = Date.now();
  
  task = await Task.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  
  // Process the task to handle manual customer consistently
  const taskObj = task.toObject();
  
  // If this is a manual customer entry (no customer ID but has manualCustomer data)
  if (!taskObj.customer && taskObj.manualCustomer) {
    // Create a consistent customer field from manualCustomer for the frontend
    taskObj.customer = {
      _id: 'manual',
      name: taskObj.manualCustomer.name,
      email: taskObj.manualCustomer.email,
      contactNumber: taskObj.manualCustomer.contactNumber,
      course: taskObj.manualCustomer.course,
      isManualEntry: true
    };
  }
  
  res.status(200).json({
    success: true,
    data: taskObj
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
  
  // Only allow task owner, admin, or manager to delete tasks
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