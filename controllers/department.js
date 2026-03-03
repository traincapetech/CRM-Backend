const Department = require('../models/Department');
const User = require('../models/User');
const Employee = require('../models/Employee');

// Get all departments from database
exports.getAllDepartments = async (req, res) => {
  try {
    const departments = await Department.find({ isActive: true }).sort({ name: 1 });

    return res.status(200).json({
      success: true,
      count: departments.length,
      data: departments
    });
  } catch (error) {
    console.error('Error in getAllDepartments:', error);
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Get department by ID
exports.getDepartmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const department = await Department.findById(id);

    if (!department) {
      return res.status(404).json({ 
        success: false,
        message: 'Department not found' 
      });
    }

    return res.status(200).json({
      success: true,
      data: department
    });
  } catch (error) {
    console.error('Error in getDepartmentById:', error);
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Get department members based on database assignment
exports.getDepartmentMembers = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if department exists
    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({ 
        success: false,
        message: 'Department not found' 
      });
    }

    // Find employees assigned to this department
    const employees = await Employee.find({ 
      department: id,
      status: 'ACTIVE'
    }).populate('userId', 'fullName name email role');

    // Extract user objects from employee data
    const members = employees.map(emp => {
      if (emp.userId) {
        return {
          _id: emp.userId._id,
          fullName: emp.userId.fullName || emp.fullName,
          name: emp.userId.name || emp.fullName,
          email: emp.userId.email || emp.email,
          role: emp.userId.role,
          employeeId: emp._id
        };
      }
      return null;
    }).filter(m => m !== null);

    return res.status(200).json({
      success: true,
      count: members.length,
      data: members
    });
  } catch (error) {
    console.error('Error in getDepartmentMembers:', error);
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Helper function to get department ID from user (via Employee record)
exports.getDepartmentForUser = async (userId) => {
  const employee = await Employee.findOne({ userId }).populate('department');
  return employee?.department;
};

// Get user's department (endpoint)
exports.getUserDepartment = async (req, res) => {
  try {
    const department = await exports.getDepartmentForUser(req.user._id);
    
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'No department found for this user'
      });
    }

    return res.status(200).json({
      success: true,
      data: department
    });
  } catch (error) {
    console.error('Error in getUserDepartment:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

