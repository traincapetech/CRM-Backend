const User = require('../models/User');

// Virtual departments based on user roles
const DEPARTMENTS = [
  {
    id: 'IT',
    name: 'IT',
    description: 'Information Technology Department',
    roles: ['IT Manager', 'IT Staff', 'IT Intern', 'IT Permanent'],
    headRole: 'IT Manager'
  },
  {
    id: 'SALES',
    name: 'Sales',
    description: 'Sales Department',
    roles: ['Manager', 'Sales Person'],
    headRole: 'Manager'
  },
  {
    id: 'LEAD',
    name: 'Lead',
    description: 'Lead Generation Department',
    roles: ['Manager', 'Lead Person'],
    headRole: 'Manager'
  },
  {
    id: 'HR',
    name: 'HR',
    description: 'Human Resources Department',
    roles: ['HR', 'Employee'],
    headRole: 'HR'
  }
];

// Get all departments (virtual departments based on roles)
exports.getAllDepartments = async (req, res) => {
  try {
    // Return virtual departments
    const departments = DEPARTMENTS.map(dept => ({
      _id: dept.id,
      name: dept.name,
      description: dept.description
    }));

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
    const department = DEPARTMENTS.find(d => d.id === id);

    if (!department) {
      return res.status(404).json({ 
        success: false,
        message: 'Department not found' 
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: department.id,
        name: department.name,
        description: department.description
      }
    });
  } catch (error) {
    console.error('Error in getDepartmentById:', error);
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Get department members based on roles
exports.getDepartmentMembers = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the virtual department
    const department = DEPARTMENTS.find(d => d.id === id);
    
    if (!department) {
      return res.status(404).json({ 
        success: false,
        message: 'Department not found' 
      });
    }

    // Find users with roles that belong to this department
    const members = await User.find({
      role: { $in: department.roles }
    })
      .select('fullName name email role')
      .sort({ role: 1, fullName: 1 }); // Head roles first, then alphabetically

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

// Helper function to get department ID from user role
exports.getDepartmentFromRole = (role) => {
  for (const dept of DEPARTMENTS) {
    if (dept.roles.includes(role)) {
      return dept.id;
    }
  }
  return null;
};

// Helper function to check if user is department head
exports.isDepartmentHead = (role) => {
  return DEPARTMENTS.some(dept => dept.headRole === role);
};

// Get user's department (helper endpoint)
exports.getUserDepartment = async (req, res) => {
  try {
    const userRole = req.user.role;
    
    const department = DEPARTMENTS.find(dept => dept.roles.includes(userRole));
    
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'No department found for this role'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: department.id,
        name: department.name,
        description: department.description,
        isHead: department.headRole === userRole
      }
    });
  } catch (error) {
    console.error('Error in getUserDepartment:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
