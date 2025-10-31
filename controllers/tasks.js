const Task = require('../models/Task');
const User = require('../models/User');

// @desc    Get all tasks
// @route   GET /api/tasks?department=IT
// @access  Private (Admin, IT Manager can see all IT tasks. Employees see their own.)
exports.getTasks = async (req, res) => {
  try {
    let query;
    
    // Support department filter from query params
    const departmentFilter = req.query.department;

    if (req.user.role === 'Admin') {
      // Admin sees all tasks, but can filter by department if specified
      if (departmentFilter) {
        query = Task.find({ department: departmentFilter }).populate('assignedTo', 'fullName').populate('assignedBy', 'fullName');
      } else {
        query = Task.find().populate('assignedTo', 'fullName').populate('assignedBy', 'fullName');
      }
    } else if (req.user.role === 'IT Manager') {
      // IT Manager sees all tasks in the IT department
      query = Task.find({ department: 'IT' }).populate('assignedTo', 'fullName').populate('assignedBy', 'fullName');
    } else if (['IT Intern', 'IT Permanent'].includes(req.user.role)) {
      // IT Intern/Permanent see only their assigned IT tasks
      query = Task.find({ 
        assignedTo: req.user.id,
        department: 'IT'
      }).populate('assignedTo', 'fullName').populate('assignedBy', 'fullName');
    } else {
      // Other employees see tasks assigned to them
      query = Task.find({ assignedTo: req.user.id }).populate('assignedTo', 'fullName').populate('assignedBy', 'fullName');
    }

    const tasks = await query;
    
    // Ensure assignedTo is properly populated - if not, fetch user data
    const tasksWithUsers = await Promise.all(tasks.map(async (task) => {
      const taskObj = task.toObject();
      
      // Handle assignedTo - check if it needs to be populated
      if (taskObj.assignedTo) {
        // If it's an ObjectId string or doesn't have fullName property, fetch the user
        if (typeof taskObj.assignedTo === 'string' || !taskObj.assignedTo.fullName) {
          const userId = typeof taskObj.assignedTo === 'object' ? (taskObj.assignedTo._id || taskObj.assignedTo.toString()) : taskObj.assignedTo;
          const user = await User.findById(userId).select('fullName');
          if (user) {
            taskObj.assignedTo = { _id: user._id.toString(), fullName: user.fullName };
          } else {
            taskObj.assignedTo = null;
          }
        } else {
          // Ensure _id is a string for consistency
          if (taskObj.assignedTo._id) {
            taskObj.assignedTo._id = taskObj.assignedTo._id.toString();
          }
        }
      }
      
      // Same for assignedBy
      if (taskObj.assignedBy) {
        if (typeof taskObj.assignedBy === 'string' || !taskObj.assignedBy.fullName) {
          const userId = typeof taskObj.assignedBy === 'object' ? (taskObj.assignedBy._id || taskObj.assignedBy.toString()) : taskObj.assignedBy;
          const user = await User.findById(userId).select('fullName');
          if (user) {
            taskObj.assignedBy = { _id: user._id.toString(), fullName: user.fullName };
          } else {
            taskObj.assignedBy = null;
          }
        } else {
          // Ensure _id is a string for consistency
          if (taskObj.assignedBy._id) {
            taskObj.assignedBy._id = taskObj.assignedBy._id.toString();
          }
        }
      }
      
      return taskObj;
    }));

    res.status(200).json({
      success: true,
      count: tasksWithUsers.length,
      data: tasksWithUsers
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Create a task
// @route   POST /api/tasks
// @access  Private (Admin, IT Manager)
exports.createTask = async (req, res) => {
  try {
    req.body.assignedBy = req.user.id;
    
    // an admin can create a task for any department, but an IT manager can only create IT tasks
    if (req.user.role === 'IT Manager') {
        req.body.department = 'IT';
    }

    const task = await Task.create(req.body);

    res.status(201).json({
      success: true,
      data: task
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Update a task
// @route   PUT /api/tasks/:id
// @access  Private
exports.updateTask = async (req, res) => {
  try {
    let task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const isAssignee = task.assignedTo.toString() === req.user.id.toString();
    const isAssigner = task.assignedBy.toString() === req.user.id.toString();
    const isAdmin = req.user.role === 'Admin';
    const isManager = req.user.role === 'IT Manager' && task.department === 'IT';

    // Assignee actions
    if (isAssignee) {
      const desired = req.body.status;
      const allowed = ['In Progress', 'Partially Completed', 'Employee Completed', 'Not Completed'];
      if (desired && allowed.includes(desired)) {
        task.status = desired;
        if (desired === 'Employee Completed') task.completedAt = Date.now();
      }
    } else if (isAdmin || isManager || isAssigner) {
      // Manager/Admin/Assigner actions
      if (req.body.status) task.status = req.body.status;
      if (req.body.title) task.title = req.body.title;
      if (req.body.description) task.description = req.body.description;
      if (req.body.assignedTo) task.assignedTo = req.body.assignedTo;
      if (task.status === 'Manager Confirmed') task.confirmedAt = Date.now();
    } else {
      return res.status(403).json({ success: false, message: 'Not authorized to update this task in this way.' });
    }

    task = await task.save();

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private (Admin, IT Manager)
exports.deleteTask = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);

        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        const isAdmin = req.user.role === 'Admin';
        const isManager = req.user.role === 'IT Manager' && task.department === 'IT';

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this task' });
        }

        await Task.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
