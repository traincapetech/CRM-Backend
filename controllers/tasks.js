const Task = require("../models/Task");
const User = require("../models/User");

// @desc    Get all tasks
// @route   GET /api/tasks?department=IT
// @access  Private (Admin, IT Manager can see all IT tasks. Employees see their own.)
exports.getTasks = async (req, res) => {
  try {
    let query;

    // Build filter object
    const filter = {};

    // Support department filter from query params
    if (req.query.department) {
      filter.department = req.query.department;
    }

    // Support salesPerson filter
    if (req.query.salesPerson) {
      filter.salesPerson = req.query.salesPerson;
    }

    // Support date filter
    if (req.query.date) {
      const searchDate = new Date(req.query.date);
      const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));
      filter.examDate = { $gte: startOfDay, $lte: endOfDay };
    }

    if (req.user.role === "Admin") {
      // Admin sees all filtered tasks
      query = Task.find(filter)
        .populate("assignedTo", "fullName")
        .populate("assignedBy", "fullName");
    } else if (req.user.role === "IT Manager") {
      // IT Manager sees all tasks in the IT department, applying filters
      filter.department = "IT";
      query = Task.find(filter)
        .populate("assignedTo", "fullName")
        .populate("assignedBy", "fullName");
    } else if (["IT Intern", "IT Permanent"].includes(req.user.role)) {
      // IT Intern/Permanent see only their assigned IT tasks, applying filters
      filter.assignedTo = req.user.id;
      filter.department = "IT";
      query = Task.find(filter)
        .populate("assignedTo", "fullName")
        .populate("assignedBy", "fullName");
    } else {
      // Other employees (like Sales Person) see tasks assigned to them or where they are the salesPerson
      // Using $or to allow seeing tasks they assigned or are responsible for
      query = Task.find({
        $and: [
          filter,
          { $or: [{ assignedTo: req.user.id }, { salesPerson: req.user.id }] },
        ],
      })
        .populate("assignedTo", "fullName")
        .populate("assignedBy", "fullName");
    }

    const tasks = await query;

    // Ensure assignedTo is properly populated - if not, fetch user data
    const tasksWithUsers = await Promise.all(
      tasks.map(async (task) => {
        const taskObj = task.toObject();

        // Handle assignedTo - check if it needs to be populated
        if (taskObj.assignedTo) {
          // If it's an ObjectId string or doesn't have fullName property, fetch the user
          if (
            typeof taskObj.assignedTo === "string" ||
            !taskObj.assignedTo.fullName
          ) {
            const userId =
              typeof taskObj.assignedTo === "object"
                ? taskObj.assignedTo._id || taskObj.assignedTo.toString()
                : taskObj.assignedTo;
            const user = await User.findById(userId).select("fullName");
            if (user) {
              taskObj.assignedTo = {
                _id: user._id.toString(),
                fullName: user.fullName,
              };
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
          if (
            typeof taskObj.assignedBy === "string" ||
            !taskObj.assignedBy.fullName
          ) {
            const userId =
              typeof taskObj.assignedBy === "object"
                ? taskObj.assignedBy._id || taskObj.assignedBy.toString()
                : taskObj.assignedBy;
            const user = await User.findById(userId).select("fullName");
            if (user) {
              taskObj.assignedBy = {
                _id: user._id.toString(),
                fullName: user.fullName,
              };
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
      }),
    );

    res.status(200).json({
      success: true,
      count: tasksWithUsers.length,
      data: tasksWithUsers,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Create a task
// @route   POST /api/tasks
// @access  Private (Admin, IT Manager)
exports.createTask = async (req, res) => {
  try {
    req.body.assignedBy = req.user.id;

    // an admin can create a task for any department, but an IT manager can only create IT tasks
    if (req.user.role === "IT Manager") {
      req.body.department = "IT";
    }

    const task = await Task.create(req.body);

    res.status(201).json({
      success: true,
      data: task,
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
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    const isAssignee = task.assignedTo?.toString() === req.user.id.toString();
    const isAssigner = task.assignedBy?.toString() === req.user.id.toString();
    const isAdmin = req.user.role === "Admin";
    const isManager =
      req.user.role === "IT Manager" && task.department === "IT";

    // Update completed status if provided
    if (req.body.completed !== undefined) {
      task.completed = req.body.completed;
      if (task.completed) {
        task.status = "Employee Completed";
        task.completedAt = Date.now();
      } else {
        task.status = "In Progress";
      }
    }

    // Assignee actions
    if (isAssignee) {
      const desired = req.body.status;
      const allowed = [
        "In Progress",
        "Partially Completed",
        "Employee Completed",
        "Not Completed",
      ];
      if (desired && allowed.includes(desired)) {
        task.status = desired;
        if (desired === "Employee Completed") {
          task.completedAt = Date.now();
          task.completed = true;
        }
      }
    } else if (isAdmin || isManager || isAssigner) {
      // Manager/Admin/Assigner actions
      if (req.body.status) task.status = req.body.status;
      if (req.body.title) task.title = req.body.title;
      if (req.body.description) task.description = req.body.description;
      if (req.body.assignedTo) task.assignedTo = req.body.assignedTo;
      if (task.status === "Manager Confirmed") task.confirmedAt = Date.now();
    } else {
      // Optional: allow other roles for Sales/Admin tasks if they are the salesPerson
      const isSalesPerson =
        task.salesPerson?.toString() === req.user.id.toString();
      if (!isSalesPerson) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to update this task.",
        });
      }
    }

    task = await task.save();

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    console.error("Error updating task:", error);
    res
      .status(500)
      .json({ success: false, message: "Server Error", error: error.message });
  }
};

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private (Admin, IT Manager)
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    const isAdmin = req.user.role === "Admin";
    const isManager =
      req.user.role === "IT Manager" && task.department === "IT";

    if (!isAdmin && !isManager) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this task",
      });
    }

    await Task.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Log time to task
// @route   POST /api/tasks/:id/time
// @access  Private
exports.logTime = async (req, res) => {
  try {
    const { hours, description, date } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    // Validate user can log time (assignee or admin/manager)
    const isAssignee = task.assignedTo.toString() === req.user.id.toString();
    const isAdmin = req.user.role === "Admin";
    const isManager =
      req.user.role === "IT Manager" && task.department === "IT";

    if (!isAssignee && !isAdmin && !isManager) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to log time for this task",
      });
    }

    if (!hours || hours <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Hours must be greater than 0" });
    }

    // Add time entry
    const timeEntry = {
      date: date ? new Date(date) : new Date(),
      hours: parseFloat(hours),
      description: description || "",
      loggedBy: req.user.id,
    };

    task.timeEntries = task.timeEntries || [];
    task.timeEntries.push(timeEntry);

    // Update total logged hours
    task.loggedHours = (task.loggedHours || 0) + parseFloat(hours);

    await task.save();

    res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update task estimated hours and story points
// @route   PUT /api/tasks/:id/estimate
// @access  Private (Admin, Manager)
exports.updateEstimate = async (req, res) => {
  try {
    const { estimatedHours, storyPoints, priority } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    const isAdmin = req.user.role === "Admin";
    const isManager =
      req.user.role === "IT Manager" && task.department === "IT";

    if (!isAdmin && !isManager) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update estimates",
      });
    }

    if (estimatedHours !== undefined) task.estimatedHours = estimatedHours;
    if (storyPoints !== undefined) task.storyPoints = storyPoints;
    if (priority !== undefined) task.priority = priority;

    await task.save();

    res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add task dependency
// @route   POST /api/tasks/:id/dependencies
// @access  Private (Admin, Manager)
exports.addDependency = async (req, res) => {
  try {
    const { dependsOnTaskId } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    const dependsOnTask = await Task.findById(dependsOnTaskId);
    if (!dependsOnTask) {
      return res
        .status(404)
        .json({ success: false, message: "Dependency task not found" });
    }

    // Prevent circular dependencies
    if (
      dependsOnTask.dependencies &&
      dependsOnTask.dependencies.includes(task._id)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Circular dependency detected" });
    }

    if (dependsOnTaskId === task._id.toString()) {
      return res
        .status(400)
        .json({ success: false, message: "Task cannot depend on itself" });
    }

    task.dependencies = task.dependencies || [];
    if (!task.dependencies.includes(dependsOnTaskId)) {
      task.dependencies.push(dependsOnTaskId);
    }

    // Update blocking relationship
    dependsOnTask.blocks = dependsOnTask.blocks || [];
    if (!dependsOnTask.blocks.includes(task._id)) {
      dependsOnTask.blocks.push(task._id);
    }

    await task.save();
    await dependsOnTask.save();

    res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Remove task dependency
// @route   DELETE /api/tasks/:id/dependencies/:dependsOnId
// @access  Private (Admin, Manager)
exports.removeDependency = async (req, res) => {
  try {
    const { id, dependsOnId } = req.params;
    const task = await Task.findById(id);

    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    task.dependencies = (task.dependencies || []).filter(
      (depId) => depId.toString() !== dependsOnId,
    );

    // Remove from blocking relationship
    const dependsOnTask = await Task.findById(dependsOnId);
    if (dependsOnTask) {
      dependsOnTask.blocks = (dependsOnTask.blocks || []).filter(
        (blockId) => blockId.toString() !== id,
      );
      await dependsOnTask.save();
    }

    await task.save();

    res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all sales persons
// @route   GET /api/tasks/sales-persons
// @access  Private (Admin, Manager)
exports.getSalesPersons = async (req, res) => {
  try {
    const salesPersons = await User.find({ role: "Sales Person" }).select(
      "fullName email",
    );

    res.status(200).json({
      success: true,
      count: salesPersons.length,
      data: salesPersons,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
