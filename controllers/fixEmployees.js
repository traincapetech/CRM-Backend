/**
 * Controller to fix existing employee records
 * Specifically fixes employmentType for IT Interns
 */

const Employee = require('../models/Employee');
const EmployeeRole = require('../models/EmployeeRole');

// @desc    Fix employmentType for IT Interns
// @route   POST /api/employees/fix-it-interns
// @access  Private (Admin, IT Manager)
exports.fixITInterns = async (req, res) => {
  try {
    // Authorization check
    if (req.user.role !== 'Admin' && req.user.role !== 'IT Manager') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to perform this action'
      });
    }

    // Find IT Intern role
    const itInternRole = await EmployeeRole.findOne({ name: 'IT Intern' });
    
    if (!itInternRole) {
      return res.status(404).json({
        success: false,
        message: 'IT Intern role not found'
      });
    }

    // Find all employees with IT Intern role but wrong/missing employmentType
    const employeesToFix = await Employee.find({
      role: itInternRole._id,
      $or: [
        { employmentType: { $ne: 'INTERN' } },
        { employmentType: { $exists: false } }
      ]
    }).populate('role');

    console.log(`Found ${employeesToFix.length} IT Intern employees to fix`);

    // Update all IT Interns to have employmentType = 'INTERN'
    const updateResult = await Employee.updateMany(
      {
        role: itInternRole._id,
        $or: [
          { employmentType: { $ne: 'INTERN' } },
          { employmentType: { $exists: false } }
        ]
      },
      {
        $set: { employmentType: 'INTERN' }
      }
    );

    // Also fix by role name (backwards compatibility)
    const allEmployees = await Employee.find({}).populate('role');
    let fixedByRoleName = 0;
    
    for (const emp of allEmployees) {
      const roleName = emp.role?.name || '';
      if (roleName && roleName.includes('IT Intern') && emp.employmentType !== 'INTERN') {
        await Employee.findByIdAndUpdate(emp._id, { employmentType: 'INTERN' });
        fixedByRoleName++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Fixed ${updateResult.modifiedCount + fixedByRoleName} IT Intern employee records`,
      fixed: updateResult.modifiedCount + fixedByRoleName,
      matched: updateResult.matchedCount
    });
  } catch (error) {
    console.error('Error fixing IT Interns:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

