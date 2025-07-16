const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Role = require('../models/EmployeeRole');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/employees/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 20 * 1024, // 20KB max
    files: 10 // Maximum 10 files per request
  },
  fileFilter: function (req, file, cb) {
    // Check minimum file size (10KB)
    if (parseInt(req.headers['content-length']) < 10 * 1024) {
      cb(new Error('File size too small. Minimum size is 10KB'), false);
      return;
    }
    
    // Allow images and PDFs
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDF files are allowed!'), false);
    }
  }
});

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private
exports.getEmployees = async (req, res) => {
  try {
    let query;

    // Copy req.query
    const reqQuery = { ...req.query };

    // Fields to exclude
    const removeFields = ['select', 'sort', 'page', 'limit'];

    // Loop over removeFields and delete them from reqQuery
    removeFields.forEach(param => delete reqQuery[param]);

    // Create query string
    let queryStr = JSON.stringify(reqQuery);

    // Create operators ($gt, $gte, etc)
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);

    // Role-based filtering
    if (req.user.role === 'HR') {
      // HR can see employees they manage or all if no hrId restriction
      query = Employee.find(JSON.parse(queryStr));
    } else if (req.user.role === 'Admin' || req.user.role === 'Manager') {
      // Admin and Manager can see all employees
      query = Employee.find(JSON.parse(queryStr));
    } else {
      // Other users can see all employees (for profile viewing)
      query = Employee.find(JSON.parse(queryStr));
    }

    // Select Fields
    if (req.query.select) {
      const fields = req.query.select.split(',').join(' ');
      query = query.select(fields);
    }

    // Sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Employee.countDocuments();

    query = query.skip(startIndex).limit(limit);

    // Executing query
    const employees = await query;

    // Pagination result
    const pagination = {};

    if (endIndex < total) {
      pagination.next = {
        page: page + 1,
        limit
      };
    }

    if (startIndex > 0) {
      pagination.prev = {
        page: page - 1,
        limit
      };
    }

    res.status(200).json({
      success: true,
      count: employees.length,
      pagination,
      data: employees
    });
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single employee
// @route   GET /api/employees/:id
// @access  Private
exports.getEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Check authorization - Allow HR, Admin, Manager, and users viewing their own profile
    if (req.user.role === 'HR' || req.user.role === 'Admin' || req.user.role === 'Manager' || 
        employee.userId?.toString() === req.user.id) {
      // Authorized
    } else {
      // Allow all users to view employee data for profile purposes
      // This enables the profile page to show employee information
    }

    res.status(200).json({
      success: true,
      data: employee
    });
  } catch (err) {
    console.error('Error fetching employee:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new employee
// @route   POST /api/employees
// @access  Private
exports.createEmployee = async (req, res) => {
  try {
    // Parse employee data from form
    const employeeData = typeof req.body.employee === 'string' ? JSON.parse(req.body.employee) : req.body;
    
    // Check if user is trying to create their own profile
    const isCreatingOwnProfile = employeeData.userId === req.user.id || 
                                !employeeData.userId || 
                                employeeData.email === req.user.email;
    
    // Allow users to create their own profiles, but restrict admin functions
    if (!isCreatingOwnProfile && !['HR', 'Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create employee profiles for other users'
      });
    }
    
    // Set the user ID for the employee
    if (isCreatingOwnProfile) {
      employeeData.userId = req.user.id;
      employeeData.fullName = employeeData.fullName || req.user.fullName;
      employeeData.email = employeeData.email || req.user.email;
    }
    
    // Add HR ID if user is HR
    if (req.user.role === 'HR') {
      employeeData.hrId = req.user.id;
    }

    // Handle file uploads
    if (req.files) {
      Object.keys(req.files).forEach(fieldName => {
        if (req.files[fieldName] && req.files[fieldName][0]) {
          employeeData[fieldName] = req.files[fieldName][0].path;
        }
      });
    }

    // Create employee
    const employee = await Employee.create(employeeData);

    // Create user account if username and password provided (admin function only)
    if (req.body.username && req.body.password && ['HR', 'Admin', 'Manager'].includes(req.user.role)) {
      const userData = {
        fullName: employeeData.fullName,
        email: employeeData.email,
        password: req.body.password,
        role: 'Employee',
        employeeId: employee._id
      };

      const user = await User.create(userData);
      employee.userId = user._id;
      await employee.save();
    }

    res.status(201).json({
      success: true,
      data: employee
    });
  } catch (err) {
    console.error('Error creating employee:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private
exports.updateEmployee = async (req, res) => {
  try {
    let employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Check authorization - Allow only HR, Admin, and Manager to update employees
    if (!['HR', 'Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update employee profiles'
      });
    }

    // Parse employee data from form
    const employeeData = req.body.employee ? JSON.parse(req.body.employee) : req.body;

    // Handle file uploads
    if (req.files) {
      Object.keys(req.files).forEach(fieldName => {
        if (req.files[fieldName] && req.files[fieldName][0]) {
          // Delete old file if exists
          if (employee[fieldName] && fs.existsSync(employee[fieldName])) {
            fs.unlinkSync(employee[fieldName]);
          }
          employeeData[fieldName] = req.files[fieldName][0].path;
        }
      });
    }

    employee = await Employee.findByIdAndUpdate(req.params.id, employeeData, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: employee
    });
  } catch (err) {
    console.error('Error updating employee:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private
exports.deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Check authorization - Allow HR, Admin, and Manager to delete employees
    if (!['HR', 'Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete employees'
      });
    }

    // Delete associated files
    const fileFields = ['photograph', 'tenthMarksheet', 'twelfthMarksheet', 'bachelorDegree', 
                       'postgraduateDegree', 'aadharCard', 'panCard', 'pcc', 'resume', 'offerLetter'];
    
    fileFields.forEach(field => {
      if (employee[field] && fs.existsSync(employee[field])) {
        fs.unlinkSync(employee[field]);
      }
    });

    // Delete associated user account
    if (employee.userId) {
      await User.findByIdAndDelete(employee.userId);
    }

    await Employee.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    console.error('Error deleting employee:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get departments
// @route   GET /api/employees/departments
// @access  Private
exports.getDepartments = async (req, res) => {
  try {
    const departments = await Department.find({ isActive: true }).sort('name');

    res.status(200).json({
      success: true,
      count: departments.length,
      data: departments
    });
  } catch (err) {
    console.error('Error fetching departments:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create department
// @route   POST /api/employees/departments
// @access  Private (Admin/Manager only)
exports.createDepartment = async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create departments'
      });
    }

    const department = await Department.create(req.body);

    res.status(201).json({
      success: true,
      data: department
    });
  } catch (err) {
    console.error('Error creating department:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Get roles
// @route   GET /api/employees/roles
// @access  Private
exports.getRoles = async (req, res) => {
  try {
    const roles = await Role.find({ isActive: true }).sort('name');

    res.status(200).json({
      success: true,
      count: roles.length,
      data: roles
    });
  } catch (err) {
    console.error('Error fetching roles:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create role
// @route   POST /api/employees/roles
// @access  Private (Admin/Manager only)
exports.createRole = async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create roles'
      });
    }

    const role = await Role.create(req.body);

    res.status(201).json({
      success: true,
      data: role
    });
  } catch (err) {
    console.error('Error creating role:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// Export multer upload middleware
exports.uploadEmployeeFiles = upload.fields([
  { name: 'photograph', maxCount: 1 },
  { name: 'tenthMarksheet', maxCount: 1 },
  { name: 'twelfthMarksheet', maxCount: 1 },
  { name: 'bachelorDegree', maxCount: 1 },
  { name: 'postgraduateDegree', maxCount: 1 },
  { name: 'aadharCard', maxCount: 1 },
  { name: 'panCard', maxCount: 1 },
  { name: 'pcc', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
  { name: 'offerLetter', maxCount: 1 }
]); 