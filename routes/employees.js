const express = require('express');
const {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getDepartments,
  createDepartment,
  getRoles,
  createRole,
  uploadEmployeeFiles
} = require('../controllers/employees');

const router = express.Router();

const { protect } = require('../middleware/auth');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const EmployeeRole = require('../models/EmployeeRole');

// Protect all routes
router.use(protect);

// Department routes - MUST come before /:id routes
router
  .route('/departments')
  .get(getDepartments)
  .post(createDepartment);

// Role routes - MUST come before /:id routes
router
  .route('/roles')
  .get(getRoles)
  .post(createRole);

// Employee routes
router
  .route('/')
  .get(getEmployees)
  .post(uploadEmployeeFiles, createEmployee);

router
  .route('/:id')
  .get(getEmployee)
  .put(uploadEmployeeFiles, updateEmployee)
  .delete(deleteEmployee);

// Convert existing users to employees
router.post('/convert-users', async (req, res) => {
  try {
    // Only allow admins to run this conversion
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Only admins can convert users to employees' 
      });
    }

    console.log('Starting conversion of existing users to employees...');

    // Get all existing users
    const User = require('../models/User');
    const users = await User.find({});
    console.log(`Found ${users.length} users to convert`);

    // Get departments and roles
    const departments = await Department.find({});
    const roles = await EmployeeRole.find({});

    // Map CRM roles to departments and employee roles
    const roleMapping = {
      'Sales Person': {
        department: departments.find(d => d.name === 'Sales') || departments[0],
        role: roles.find(r => r.title === 'International Sales Executive') || roles[0]
      },
      'Lead Person': {
        department: departments.find(d => d.name === 'Sales') || departments[0],
        role: roles.find(r => r.title === 'Lead Executive') || roles[0]
      },
      'Manager': {
        department: departments.find(d => d.name === 'Sales') || departments[0],
        role: roles.find(r => r.title === 'Manager') || roles[0]
      },
      'Admin': {
        department: departments.find(d => d.name === 'IT') || departments[0],
        role: roles.find(r => r.title === 'Manager') || roles[0]
      },
      'HR': {
        department: departments.find(d => d.name === 'HR') || departments[0],
        role: roles.find(r => r.title === 'HR Executive') || roles[0]
      }
    };

    let convertedCount = 0;
    let skippedCount = 0;
    const results = [];

    for (const user of users) {
      // Check if employee record already exists for this user
      const existingEmployee = await Employee.findOne({
        $or: [
          { userId: user._id },
          { 'personalInfo.email': user.email }
        ]
      });

      if (existingEmployee) {
        console.log(`Employee record already exists for user: ${user.email}`);
        results.push({ user: user.email, status: 'skipped', reason: 'already exists' });
        skippedCount++;
        continue;
      }

      // Get mapping for this user's role
      const mapping = roleMapping[user.role];
      if (!mapping) {
        console.log(`No mapping found for role: ${user.role}, skipping user: ${user.email}`);
        results.push({ user: user.email, status: 'skipped', reason: 'no role mapping' });
        skippedCount++;
        continue;
      }

      // Generate employee ID
      const employeeCount = await Employee.countDocuments();
      const employeeId = `EMP${String(employeeCount + 1).padStart(4, '0')}`;

      // Split full name
      const nameParts = user.fullName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Create employee record
      const employeeData = {
        employeeId,
        userId: user._id,
        personalInfo: {
          firstName,
          lastName,
          email: user.email,
          phone: '', // Will be empty, can be filled later
          address: '', // Will be empty, can be filled later
          dateOfBirth: null,
          gender: '',
          emergencyContact: {
            name: '',
            relationship: '',
            phone: ''
          }
        },
        professionalInfo: {
          joiningDate: user.createdAt, // Use account creation date as joining date
          employmentType: 'Full-time',
          workLocation: 'Office',
          salary: 0, // Will be 0, can be updated later
          probationPeriod: 3
        },
        department: mapping.department._id,
        role: mapping.role._id,
        educationalInfo: [], // Empty array, can be filled later
        documents: {}, // Empty object, can be filled later
        status: 'Active'
      };

      const newEmployee = new Employee(employeeData);
      await newEmployee.save();

      // Update user record to link to employee
      await User.findByIdAndUpdate(user._id, {
        employeeId: newEmployee._id
      });

      console.log(`✅ Converted user ${user.email} to employee ${employeeId}`);
      results.push({ user: user.email, status: 'converted', employeeId });
      convertedCount++;
    }

    const summary = {
      totalUsers: users.length,
      converted: convertedCount,
      skipped: skippedCount,
      results
    };

    console.log('\n=== Conversion Summary ===');
    console.log(`Total users processed: ${users.length}`);
    console.log(`Successfully converted: ${convertedCount}`);
    console.log(`Skipped (already exists): ${skippedCount}`);
    console.log('Conversion completed!');

    res.json({
      success: true,
      message: 'User to employee conversion completed',
      data: summary
    });

  } catch (error) {
    console.error('Error during conversion:', error);
    res.status(500).json({
      success: false,
      message: 'Error during conversion',
      error: error.message
    });
  }
});

module.exports = router; 