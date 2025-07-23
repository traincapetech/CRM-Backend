const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Incentive = require('../models/Incentive');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// @desc    Generate payroll for a specific month
// @route   POST /api/payroll/generate
// @access  Private (Admin/HR/Manager)
exports.generatePayroll = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to generate payroll'
      });
    }

    const { employeeId, month, year } = req.body;

    // Validate input
    if (!employeeId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, month, and year are required'
      });
    }

    // Check if payroll already exists
    const existingPayroll = await Payroll.findOne({
      employeeId,
      month,
      year
    });

    if (existingPayroll) {
      return res.status(400).json({
        success: false,
        message: 'Payroll already exists for this month'
      });
    }

    // Get employee details and ensure we have their userId
    const employee = await Employee.findById(employeeId).populate('userId');
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    if (!employee.userId) {
      return res.status(400).json({
        success: false,
        message: 'Employee record does not have an associated user account'
      });
    }

    // Create payroll record with both employeeId and userId
    const payrollData = {
      ...req.body,
      employeeId: employee._id,
      userId: employee.userId._id  // Make sure to set the userId from the employee record
    };

    const payroll = await Payroll.create(payrollData);
    await payroll.save();

    res.status(201).json({
      success: true,
      data: payroll,
      message: 'Payroll generated successfully'
    });
  } catch (error) {
    console.error('Generate payroll error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during payroll generation',
      error: error.message
    });
  }
};

// @desc    Get payroll records
// @route   GET /api/payroll
// @access  Private
exports.getPayroll = async (req, res) => {
  try {
    const { month, year, employeeId } = req.query;
    let query = {};

    // Build query based on filters
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);

    // Find the employee record for the current user
    const employee = await Employee.findOne({ userId: req.user.id })
      .populate('department')
      .populate('role');

    console.log('User details:', {
      userId: req.user.id,
      userRole: req.user.role,
      employeeId: employee?._id,
      email: req.user.email,
      name: req.user.fullName
    });

    // If employee ID is provided in query, use that
    if (employeeId) {
      query.employeeId = employeeId;
    }
    // Otherwise, if user is not admin/HR/manager, only show their own payroll
    else if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      if (employee) {
        // Use both employeeId and userId to ensure we catch all records
        query.$or = [
          { employeeId: employee._id },
          { userId: req.user.id }
        ];
      } else {
        // Try to find or create employee record
        try {
          const Department = require('../models/Department');
          const EmployeeRole = require('../models/EmployeeRole');

          // Get or create default department
          let department = await Department.findOne({ name: 'General' });
          if (!department) {
            department = await Department.create({
              name: 'General',
              description: 'Default department'
            });
          }

          // Get or create default role
          let role = await EmployeeRole.findOne({ name: req.user.role });
          if (!role) {
            role = await EmployeeRole.create({
              name: req.user.role,
              description: `Default role for ${req.user.role}`
            });
          }

          // Create employee record
          const newEmployee = await Employee.create({
            userId: req.user.id,
            fullName: req.user.fullName,
            email: req.user.email,
            department: department._id,
            role: role._id,
            status: 'ACTIVE'
          });

          console.log('Created new employee record:', newEmployee._id);
          query.$or = [
            { employeeId: newEmployee._id },
            { userId: req.user.id }
          ];
        } catch (error) {
          console.error('Error creating employee record:', error);
          query.userId = req.user.id;
        }
      }
    }

    console.log('Final query:', JSON.stringify(query, null, 2));

    // Fetch payroll records with populated employee and user details
    const payrolls = await Payroll.find(query)
      .populate({
        path: 'employeeId',
        select: 'fullName email department role phoneNumber userId',
        populate: [
          { path: 'department', select: 'name' },
          { path: 'role', select: 'name' }
        ]
      })
      .populate('userId', 'fullName email')
      .sort({ year: -1, month: -1 });

    console.log('Found payrolls:', payrolls.map(p => ({
      id: p._id,
      month: p.month,
      year: p.year,
      status: p.status,
      employeeId: p.employeeId?._id,
      userId: p.userId?._id,
      netSalary: p.netSalary
    })));

    // Transform payroll data
    const transformedPayrolls = payrolls.map(p => {
      const payrollObj = p.toObject();
      return {
        ...payrollObj,
        monthName: [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ][p.month - 1],
        // Include these fields to help with debugging
        _employeeMatch: employee ? employee._id.equals(p.employeeId?._id) : false,
        _userMatch: req.user.id === (p.userId?._id?.toString() || p.userId?.toString())
      };
    });

    return res.json({
      success: true,
      count: transformedPayrolls.length,
      data: transformedPayrolls,
      debug: {
        userRole: req.user.role,
        employeeId: employee?._id,
        userId: req.user.id,
        query: query
      }
    });

  } catch (error) {
    console.error('Error in getPayroll:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching payroll records',
      error: error.message
    });
  }
};

// @desc    Update payroll
// @route   PUT /api/payroll/:id
// @access  Private (Admin/HR/Manager)
exports.updatePayroll = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update payroll'
      });
    }

    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    // Update allowed fields
    const allowedFields = [
      'baseSalary', 'daysPresent', 'calculatedSalary', 'workingDays',
      // Manual Allowances
      'hra', 'da', 'conveyanceAllowance', 'medicalAllowance', 'specialAllowance', 'overtimeAmount',
      // Bonuses
      'performanceBonus', 'projectBonus', 'attendanceBonus', 'festivalBonus',
      // Manual Deductions
      'pf', 'esi', 'tax', 'loan', 'other',
      // Status and notes
      'notes', 'status'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        payroll[field] = req.body[field];
      }
    });

    // Auto-calculate salary if base salary or days present are updated
    if (req.body.baseSalary !== undefined || req.body.daysPresent !== undefined) {
      const baseSalary = req.body.baseSalary || payroll.baseSalary;
      const daysPresent = req.body.daysPresent || payroll.daysPresent;
      payroll.calculatedSalary = (baseSalary / 30) * daysPresent;
    }

    // Auto-calculate absent days if working days or present days are updated
    if (req.body.workingDays !== undefined || req.body.daysPresent !== undefined) {
      const presentDays = req.body.daysPresent || payroll.presentDays;
      payroll.absentDays = 30 - presentDays;
      
      console.log('📅 Updated attendance calculation:', {
        standardWorkingDays: 30,
        presentDays: payroll.presentDays,
        absentDays: payroll.absentDays
      });
    }

    // If status is being approved, set approval details
    if (req.body.status === 'APPROVED') {
      payroll.approvedBy = req.user.id;
      payroll.approvedDate = new Date();
    }

    await payroll.save();

    // Populate employee details for response
    await payroll.populate('employeeId', 'fullName email department');
    await payroll.populate('userId', 'fullName email');

    res.status(200).json({
      success: true,
      data: payroll,
      message: 'Payroll updated successfully'
    });
  } catch (error) {
    console.error('Update payroll error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Generate salary slip PDF
// @route   GET /api/payroll/:id/salary-slip
// @access  Private
exports.generateSalarySlip = async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id)
      .populate('employeeId', 'fullName email phoneNumber department')
      .populate('userId', 'fullName email');

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    // Check authorization - allow both admin and the employee themselves
    const isAdmin = ['Admin', 'HR', 'Manager'].includes(req.user.role);
    const isEmployee = req.user.id === payroll.userId.toString();
    if (!isAdmin && !isEmployee) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this salary slip'
      });
    }

    // Create PDF and pipe directly to response
    const doc = new PDFDocument();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="salary-slip-${payroll.employeeId.fullName}-${payroll.month}-${payroll.year}.pdf"`);
    
    // Pipe the PDF directly to the response
    doc.pipe(res);

    // Company Logo
    try {
      const logoPath = path.join(__dirname, '../assets/images/traincape-logo.jpg');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 250, 30, { width: 100, height: 60 });
        doc.moveDown(2);
      }
    } catch (error) {
      console.log('Logo not found, continuing without logo');
      doc.moveDown();
    }

    // Header
    doc.fontSize(16).text('SALARY SLIP', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text('Traincape Technology', { align: 'center' });
    doc.fontSize(10).text('Khandolia Plaza, 118C, Dabri - Palam Rd, Delhi 110045', { align: 'center' });
    doc.moveDown();

    // Employee Details
    doc.fontSize(10);
    doc.text(`Employee Name: ${payroll.employeeId.fullName}`);
    doc.text(`Employee ID: ${payroll.employeeId._id}`);
    doc.text(`Department: ${payroll.employeeId.department?.name || 'N/A'}`);
    doc.text(`Email: ${payroll.employeeId.email}`);
    doc.text(`Phone: ${payroll.employeeId.phoneNumber || 'N/A'}`);
    doc.moveDown();

    // Pay Period
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    doc.text(`Pay Period: ${months[payroll.month - 1]} ${payroll.year}`);
    doc.text(`Working Days: ${payroll.workingDays}`);
    doc.text(`Days Present: ${payroll.daysPresent}`);
    doc.moveDown();

    // Earnings
    doc.fontSize(12).text('Earnings', { underline: true });
    doc.fontSize(10);
    doc.text(`Base Salary: ₹${payroll.baseSalary.toFixed(2)}`);
    doc.text(`House Rent Allowance (HRA): ₹${payroll.hra.toFixed(2)}`);
    doc.text(`Dearness Allowance (DA): ₹${payroll.da.toFixed(2)}`);
    doc.text(`Conveyance Allowance: ₹${payroll.conveyanceAllowance.toFixed(2)}`);
    doc.text(`Medical Allowance: ₹${payroll.medicalAllowance.toFixed(2)}`);
    doc.text(`Special Allowance: ₹${payroll.specialAllowance.toFixed(2)}`);
    doc.text(`Overtime Amount: ₹${payroll.overtimeAmount.toFixed(2)}`);
    doc.moveDown();

    // Bonuses
    doc.fontSize(12).text('Bonuses', { underline: true });
    doc.fontSize(10);
    doc.text(`Performance Bonus: ₹${payroll.performanceBonus.toFixed(2)}`);
    doc.text(`Project Bonus: ₹${payroll.projectBonus.toFixed(2)}`);
    doc.text(`Attendance Bonus: ₹${payroll.attendanceBonus.toFixed(2)}`);
    doc.text(`Festival Bonus: ₹${payroll.festivalBonus.toFixed(2)}`);
    doc.moveDown();

    // Deductions
    doc.fontSize(12).text('Deductions', { underline: true });
    doc.fontSize(10);
    doc.text(`Provident Fund (PF): ₹${payroll.pf.toFixed(2)}`);
    doc.text(`ESI: ₹${payroll.esi.toFixed(2)}`);
    doc.text(`Professional Tax: ₹${payroll.tax.toFixed(2)}`);
    doc.text(`Loan Recovery: ₹${payroll.loan.toFixed(2)}`);
    doc.text(`Other Deductions: ₹${payroll.other.toFixed(2)}`);
    doc.moveDown();

    // Total Calculations
    const totalEarnings = payroll.baseSalary + payroll.hra + payroll.da + 
                         payroll.conveyanceAllowance + payroll.medicalAllowance + 
                         payroll.specialAllowance + payroll.overtimeAmount +
                         payroll.performanceBonus + payroll.projectBonus + 
                         payroll.attendanceBonus + payroll.festivalBonus;

    const totalDeductions = payroll.pf + payroll.esi + payroll.tax + 
                          payroll.loan + payroll.other;

    doc.fontSize(12).text('Summary', { underline: true });
    doc.fontSize(10);
    doc.text(`Total Earnings: ₹${totalEarnings.toFixed(2)}`);
    doc.text(`Total Deductions: ₹${totalDeductions.toFixed(2)}`);
    doc.moveDown();
    doc.fontSize(12).text(`Net Salary: ₹${payroll.netSalary.toFixed(2)}`, { bold: true });

    // Footer
    doc.moveDown(2);
    doc.fontSize(8);
    doc.text('This is a computer-generated document. No signature is required.', { align: 'center' });
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('Generate salary slip error:', error);
    // Only send error response if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Server error while generating salary slip',
        error: error.message
      });
    }
  }
};

// @desc    Get salary slip download link
// @route   GET /api/payroll/:id/download
// @access  Private
exports.downloadSalarySlip = async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id)
      .populate('employeeId', 'fullName email phoneNumber department')
      .populate('userId', 'fullName email');

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    // Check authorization - allow both admin and the employee themselves
    const isAdmin = ['Admin', 'HR', 'Manager', 'User', 'Sales Person'].includes(req.user.role);
    const isEmployee = req.user.id === payroll.userId.toString();
    if (!isAdmin && !isEmployee) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to download this salary slip'
      });
    }

    // Generate and stream the PDF
    const doc = new PDFDocument();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="salary-slip-${payroll.employeeId.fullName}-${payroll.month}-${payroll.year}.pdf"`);
    
    // Pipe the PDF directly to the response
    doc.pipe(res);

    // Company Logo
    try {
      const logoPath = path.join(__dirname, '../assets/images/traincape-logo.jpg');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 250, 30, { width: 100, height: 60 });
        doc.moveDown(2);
      }
    } catch (error) {
      console.log('Logo not found, continuing without logo');
      doc.moveDown();
    }

    // Header
    doc.fontSize(16).text('SALARY SLIP', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text('Traincape Technology', { align: 'center' });
    doc.fontSize(10).text('Khandolia Plaza, 118C, Dabri - Palam Rd, Delhi 110045', { align: 'center' });
    doc.moveDown();

    // Employee Details
    doc.fontSize(10);
    doc.text(`Employee Name: ${payroll.employeeId.fullName}`);
    doc.text(`Employee ID: ${payroll.employeeId._id}`);
    doc.text(`Department: ${payroll.employeeId.department?.name || 'N/A'}`);
    doc.text(`Email: ${payroll.employeeId.email}`);
    doc.text(`Phone: ${payroll.employeeId.phoneNumber || 'N/A'}`);
    doc.moveDown();

    // Pay Period
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    doc.text(`Pay Period: ${months[payroll.month - 1]} ${payroll.year}`);
    doc.text(`Working Days: ${payroll.workingDays}`);
    doc.text(`Days Present: ${payroll.daysPresent}`);
    doc.moveDown();

    // Earnings
    doc.fontSize(12).text('Earnings', { underline: true });
    doc.fontSize(10);
    doc.text(`Base Salary: ₹${payroll.baseSalary.toFixed(2)}`);
    doc.text(`House Rent Allowance (HRA): ₹${payroll.hra.toFixed(2)}`);
    doc.text(`Dearness Allowance (DA): ₹${payroll.da.toFixed(2)}`);
    doc.text(`Conveyance Allowance: ₹${payroll.conveyanceAllowance.toFixed(2)}`);
    doc.text(`Medical Allowance: ₹${payroll.medicalAllowance.toFixed(2)}`);
    doc.text(`Special Allowance: ₹${payroll.specialAllowance.toFixed(2)}`);
    doc.text(`Overtime Amount: ₹${payroll.overtimeAmount.toFixed(2)}`);
    doc.moveDown();

    // Bonuses
    doc.fontSize(12).text('Bonuses', { underline: true });
    doc.fontSize(10);
    doc.text(`Performance Bonus: ₹${payroll.performanceBonus.toFixed(2)}`);
    doc.text(`Project Bonus: ₹${payroll.projectBonus.toFixed(2)}`);
    doc.text(`Attendance Bonus: ₹${payroll.attendanceBonus.toFixed(2)}`);
    doc.text(`Festival Bonus: ₹${payroll.festivalBonus.toFixed(2)}`);
    doc.moveDown();

    // Deductions
    doc.fontSize(12).text('Deductions', { underline: true });
    doc.fontSize(10);
    doc.text(`Provident Fund (PF): ₹${payroll.pf.toFixed(2)}`);
    doc.text(`ESI: ₹${payroll.esi.toFixed(2)}`);
    doc.text(`Professional Tax: ₹${payroll.tax.toFixed(2)}`);
    doc.text(`Loan Recovery: ₹${payroll.loan.toFixed(2)}`);
    doc.text(`Other Deductions: ₹${payroll.other.toFixed(2)}`);
    doc.moveDown();

    // Total Calculations
    const totalEarnings = payroll.baseSalary + payroll.hra + payroll.da + 
                         payroll.conveyanceAllowance + payroll.medicalAllowance + 
                         payroll.specialAllowance + payroll.overtimeAmount +
                         payroll.performanceBonus + payroll.projectBonus + 
                         payroll.attendanceBonus + payroll.festivalBonus;

    const totalDeductions = payroll.pf + payroll.esi + payroll.tax + 
                          payroll.loan + payroll.other;

    doc.fontSize(12).text('Summary', { underline: true });
    doc.fontSize(10);
    doc.text(`Total Earnings: ₹${totalEarnings.toFixed(2)}`);
    doc.text(`Total Deductions: ₹${totalDeductions.toFixed(2)}`);
    doc.moveDown();
    doc.fontSize(12).text(`Net Salary: ₹${payroll.netSalary.toFixed(2)}`, { bold: true });

    // Footer
    doc.moveDown(2);
    doc.fontSize(8);
    doc.text('This is a computer-generated document. No signature is required.', { align: 'center' });
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('Download salary slip error:', error);
    // Only send error response if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Server error while downloading salary slip',
        error: error.message
      });
    }
  }
};

// @desc    Approve payroll
// @route   PUT /api/payroll/:id/approve
// @access  Private (Admin/HR/Manager)
exports.approvePayroll = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to approve payroll'
      });
    }

    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    payroll.status = 'APPROVED';
    payroll.approvedBy = req.user.id;
    payroll.approvedDate = new Date();
    
    await payroll.save();

    res.status(200).json({
      success: true,
      data: payroll,
      message: 'Payroll approved successfully'
    });
  } catch (error) {
    console.error('Approve payroll error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete payroll
// @route   DELETE /api/payroll/:id
// @access  Private (Admin/HR/Manager)
exports.deletePayroll = async (req, res) => {
  try {
    console.log('Delete payroll request received for ID:', req.params.id);
    console.log('User role:', req.user.role);
    
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      console.log('Authorization failed - user role not allowed');
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete payroll'
      });
    }

    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      console.log('Payroll not found with ID:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    console.log('Payroll found with status:', payroll.status);
    
    console.log('Attempting to delete payroll...');
    
    // Delete associated salary slip file if exists
    if (payroll.salarySlipPath && fs.existsSync(payroll.salarySlipPath)) {
      fs.unlinkSync(payroll.salarySlipPath);
      console.log('Deleted salary slip file');
    }

    // Reset associated incentives if any
    const Incentive = require('../models/Incentive');
    await Incentive.updateMany(
      { payrollId: payroll._id },
      { $unset: { payrollId: 1 } }
    );
    console.log('Reset associated incentives');

    await Payroll.findByIdAndDelete(req.params.id);
    console.log('Payroll deleted successfully');

    res.status(200).json({
      success: true,
      data: {},
      message: 'Payroll deleted successfully'
    });
  } catch (error) {
    console.error('Delete payroll error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
}; 