const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
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
      userId: employee.userId._id // Make sure to set the userId from the employee record
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
      .populate('employeeId', 'fullName email phoneNumber department userId')
      .populate('userId', 'fullName email');

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    // Check authorization - allow admin/HR/manager to view any, others only their own
    const isAdmin = ['Admin', 'HR', 'Manager'].includes(req.user.role);
    
    // Check if user is the employee (either through userId or employeeId)
    const isEmployee = req.user.id === payroll.userId.toString() || 
                      req.user.id === payroll.employeeId?.userId?.toString();
    
    console.log('Generate salary slip authorization check:', {
      userId: req.user.id,
      userRole: req.user.role,
      payrollUserId: payroll.userId?.toString(),
      payrollEmployeeUserId: payroll.employeeId?.userId?.toString(),
      isAdmin,
      isEmployee
    });
    
    if (!isAdmin && !isEmployee) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this salary slip'
      });
    }

    // Create PDF and pipe directly to response
    const doc = new PDFDocument({ margin: 30 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="salary-slip-${payroll.employeeId.fullName}-${payroll.month}-${payroll.year}.pdf"`);
    
    // Pipe the PDF directly to the response
    doc.pipe(res);

    // Call the unified PDF generation function
    generatePDFContent(doc, payroll);

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
      .populate('employeeId', 'fullName email phoneNumber department userId')
      .populate('userId', 'fullName email');

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    // Check authorization - allow admin/HR/manager to view any, others only their own
    const isAdmin = ['Admin', 'HR', 'Manager'].includes(req.user.role);
    
    // Check if user is the employee (either through userId or employeeId)
    const isEmployee = req.user.id === payroll.userId.toString() || 
                      req.user.id === payroll.employeeId?.userId?.toString();
    
    console.log('Download authorization check:', {
      userId: req.user.id,
      userRole: req.user.role,
      payrollUserId: payroll.userId?.toString(),
      payrollEmployeeUserId: payroll.employeeId?.userId?.toString(),
      isAdmin,
      isEmployee
    });
    
    if (!isAdmin && !isEmployee) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to download this salary slip'
      });
    }

    // Generate and stream the PDF
    const doc = new PDFDocument({ margin: 30 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="salary-slip-${payroll.employeeId.fullName}-${payroll.month}-${payroll.year}.pdf"`);
    
    // Pipe the PDF directly to the response
    doc.pipe(res);

    // Call the unified PDF generation function
    generatePDFContent(doc, payroll);

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

/**
 * Generates the content for the PDF salary slip.
 * @param {object} doc - The PDFDocument instance.
 * @param {object} payroll - The payroll data object.
 */
const generatePDFContent = (doc, payroll) => {
  // Set up the border
  doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).stroke();

  // Company Logo
  const logoPath = path.join(__dirname, '../assets/images/traincape-logo.jpg');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, doc.page.width / 2 + 160, 33, { width: 80 });
  }
  doc.moveDown(2);

  // Header
  doc.fontSize(18).text('SALARY SLIP', { align: 'center', bold: true });
  doc.fontSize(12).text('Traincape Technology', { align: 'center' });
  doc.fontSize(10).text('Khandolia Plaza, 118C, Dabri - Palam Rd, Delhi 110045', { align: 'center' });
  doc.moveDown();
  doc.strokeColor('#aaaaaa').lineWidth(1).lineCap('butt').moveTo(50, doc.y).lineTo(doc.page.width - 0, doc.y).stroke();
  doc.moveDown();

  // Employee Details
  const contentIndent = 20; // Define a consistent indent for padding

  doc.fontSize(12).text('Employee Details', { underline: true, indent: contentIndent });
  doc.fontSize(10);
  doc.text(`Name: ${payroll.employeeId.fullName}`, { indent: contentIndent });
  doc.text(`Employee ID: ${payroll.employeeId._id}`, { indent: contentIndent });
  doc.text(`Department: ${payroll.employeeId.department?.name || 'N/A'}`, { indent: contentIndent });
  doc.text(`Email: ${payroll.employeeId.email}`, { indent: contentIndent });
  doc.text(`Phone: ${payroll.employeeId.phoneNumber || 'N/A'}`, { indent: contentIndent });
  doc.moveDown();
  doc.strokeColor('#aaaaaa').lineWidth(1).lineCap('butt').moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
  doc.moveDown();
  
  // Pay Period
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  doc.fontSize(12).text('Pay Period', { underline: true, indent: contentIndent });
  doc.fontSize(10);
  doc.text(`Month: ${months[payroll.month - 1]} ${payroll.year}`, { indent: contentIndent });
  doc.text(`Working Days: ${payroll.workingDays}`, { indent: contentIndent });
  doc.text(`Days Present: ${payroll.daysPresent}`, { indent: contentIndent });
  doc.moveDown();
  doc.strokeColor('#aaaaaa').lineWidth(1).lineCap('butt').moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
  doc.moveDown();

  // Earnings and Deductions in two columns
  const startX = 50;
  const columnWidth = (doc.page.width - 100) / 2;
  const startY = doc.y;

  // Earnings Column
  doc.fontSize(12).text('Earnings', startX, startY, { underline: true });
  doc.fontSize(10);
  let earningsY = doc.y + 10;
  doc.text(`Base Salary:`, startX, earningsY);
  doc.text(`Rs. ${payroll.baseSalary.toFixed(2)}`, startX + 150, earningsY, { align: 'right', width: columnWidth - 150 });
  earningsY += 20;

  doc.text(`HRA:`, startX, earningsY);
  doc.text(`Rs. ${payroll.hra.toFixed(2)}`, startX + 150, earningsY, { align: 'right', width: columnWidth - 150 });
  earningsY += 20;

  doc.text(`DA:`, startX, earningsY);
  doc.text(`Rs. ${payroll.da.toFixed(2)}`, startX + 150, earningsY, { align: 'right', width: columnWidth - 150 });
  earningsY += 20;

  doc.text(`Conveyance:`, startX, earningsY);
  doc.text(`Rs. ${payroll.conveyanceAllowance.toFixed(2)}`, startX + 150, earningsY, { align: 'right', width: columnWidth - 150 });
  earningsY += 20;

  doc.text(`Medical:`, startX, earningsY);
  doc.text(`Rs. ${payroll.medicalAllowance.toFixed(2)}`, startX + 150, earningsY, { align: 'right', width: columnWidth - 150 });
  earningsY += 20;

  doc.text(`Special:`, startX, earningsY);
  doc.text(`Rs. ${payroll.specialAllowance.toFixed(2)}`, startX + 150, earningsY, { align: 'right', width: columnWidth - 150 });
  earningsY += 20;

  doc.text(`Overtime:`, startX, earningsY);
  doc.text(`Rs. ${payroll.overtimeAmount.toFixed(2)}`, startX + 150, earningsY, { align: 'right', width: columnWidth - 150 });
  earningsY += 20;

  // Bonuses
  earningsY += 10;
  doc.text(`Performance Bonus:`, startX, earningsY);
  doc.text(`Rs. ${payroll.performanceBonus.toFixed(2)}`, startX + 150, earningsY, { align: 'right', width: columnWidth - 150 });
  earningsY += 20;

  doc.text(`Project Bonus:`, startX, earningsY);
  doc.text(`Rs. ${payroll.projectBonus.toFixed(2)}`, startX + 150, earningsY, { align: 'right', width: columnWidth - 150 });
  earningsY += 20;

  doc.text(`Attendance Bonus:`, startX, earningsY);
  doc.text(`Rs. ${payroll.attendanceBonus.toFixed(2)}`, startX + 150, earningsY, { align: 'right', width: columnWidth - 150 });
  earningsY += 20;

  doc.text(`Festival Bonus:`, startX, earningsY);
  doc.text(`Rs. ${payroll.festivalBonus.toFixed(2)}`, startX + 150, earningsY, { align: 'right', width: columnWidth - 150 });
  earningsY += 20;

  // Deductions Column
  const deductionsX = startX + columnWidth + 10;
  doc.fontSize(12).text('Deductions', deductionsX, startY, { underline: true });
  doc.fontSize(10);
  let deductionsY = doc.y + 10;
  doc.text(`Provident Fund (PF):`, deductionsX, deductionsY);
  doc.text(`Rs. ${payroll.pf.toFixed(2)}`, deductionsX + 150, deductionsY, { align: 'right', width: columnWidth - 150 });
  deductionsY += 20;

  doc.text(`ESI:`, deductionsX, deductionsY);
  doc.text(`Rs. ${payroll.esi.toFixed(2)}`, deductionsX + 150, deductionsY, { align: 'right', width: columnWidth - 150 });
  deductionsY += 20;

  doc.text(`Professional Tax:`, deductionsX, deductionsY);
  doc.text(`Rs. ${payroll.tax.toFixed(2)}`, deductionsX + 150, deductionsY, { align: 'right', width: columnWidth - 150 });
  deductionsY += 20;

  doc.text(`Loan Recovery:`, deductionsX, deductionsY);
  doc.text(`Rs. ${payroll.loan.toFixed(2)}`, deductionsX + 150, deductionsY, { align: 'right', width: columnWidth - 150 });
  deductionsY += 20;

  doc.text(`Other Deductions:`, deductionsX, deductionsY);
  doc.text(`Rs. ${payroll.other.toFixed(2)}`, deductionsX + 150, deductionsY, { align: 'right', width: columnWidth - 150 });

  doc.y = Math.max(earningsY, deductionsY) + 20;
  doc.strokeColor('#aaaaaa').lineWidth(1).lineCap('butt').moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
  doc.moveDown();

  // Summary
  doc.fontSize(12).text('Summary', { underline: true });
  doc.fontSize(10);
  const totalEarnings = payroll.baseSalary + payroll.hra + payroll.da + 
                       payroll.conveyanceAllowance + payroll.medicalAllowance + 
                       payroll.specialAllowance + payroll.overtimeAmount +
                       payroll.performanceBonus + payroll.projectBonus + 
                       payroll.attendanceBonus + payroll.festivalBonus;

  const totalDeductions = payroll.pf + payroll.esi + payroll.tax + 
                        payroll.loan + payroll.other;

  doc.text(`Total Earnings: Rs. ${totalEarnings.toFixed(2)}`);
  doc.text(`Total Deductions: Rs. ${totalDeductions.toFixed(2)}`);
  doc.moveDown();

  doc.fontSize(14).text(`Net Salary: Rs. ${payroll.netSalary.toFixed(2)}`, { bold: true });
  doc.moveDown(2);

  // Footer
  doc.fontSize(8);
  doc.text('This is a computer-generated document. No signature is required.', { align: 'center' });
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
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