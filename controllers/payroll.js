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

    // Get employee details
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Get attendance data for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const attendance = await Attendance.find({
      employeeId: employeeId,
      date: { $gte: startDate, $lte: endDate }
    });

    // Calculate attendance summary
    const workingDays = endDate.getDate();
    const presentDays = attendance.filter(a => a.status === 'PRESENT').length;
    const halfDays = attendance.filter(a => a.status === 'HALF_DAY').length;
    const absentDays = workingDays - attendance.length;
    const overtimeHours = attendance.reduce((sum, a) => sum + (a.overtimeHours || 0), 0);

    // Get approved incentives for the month
    const incentives = await Incentive.getIncentivesForPayroll(employeeId, month, year);
    
    // Calculate incentive amounts
    const performanceBonus = incentives
      .filter(i => i.type === 'PERFORMANCE')
      .reduce((sum, i) => sum + i.amount, 0);
    
    const projectBonus = incentives
      .filter(i => i.type === 'PROJECT')
      .reduce((sum, i) => sum + i.amount, 0);
    
    const festivalBonus = incentives
      .filter(i => i.type === 'FESTIVAL')
      .reduce((sum, i) => sum + i.amount, 0);

    // Create payroll record
    const payrollData = {
      employeeId,
      userId: employee.userId,
      month,
      year,
      basicSalary: employee.salary,
      workingDays,
      presentDays,
      absentDays,
      halfDays,
      overtimeHours,
      performanceBonus,
      projectBonus,
      festivalBonus,
      basicAmount: 0, // Will be calculated by the model
      grossSalary: 0, // Will be calculated by the model
      totalDeductions: 0, // Will be calculated by the model
      netSalary: 0 // Will be calculated by the model
    };

    const payroll = await Payroll.create(payrollData);

    // Update incentives with payroll reference
    await Incentive.updateMany(
      { _id: { $in: incentives.map(i => i._id) } },
      { payrollId: payroll._id }
    );

    res.status(201).json({
      success: true,
      data: payroll,
      message: 'Payroll generated successfully'
    });
  } catch (error) {
    console.error('Generate payroll error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during payroll generation'
    });
  }
};

// @desc    Get payroll records
// @route   GET /api/payroll
// @access  Private
exports.getPayroll = async (req, res) => {
  try {
    const { month, year, employeeId } = req.query;
    
    // Build query based on user role
    let query = {};
    
    if (req.user.role === 'Employee') {
      // Employees can only see their own payroll
      const employee = await Employee.findOne({ userId: req.user.id });
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee record not found'
        });
      }
      query.employeeId = employee._id;
    } else if (['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      // Admin/HR/Manager can see all or filter by employee
      if (employeeId) {
        query.employeeId = employeeId;
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view payroll'
      });
    }
    
    // Add month/year filters
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);
    
    const payroll = await Payroll.find(query)
      .populate('employeeId', 'fullName email department')
      .populate('userId', 'fullName email')
      .sort({ year: -1, month: -1 });

    res.status(200).json({
      success: true,
      data: payroll
    });
  } catch (error) {
    console.error('Get payroll error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
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
      'performanceBonus', 'projectBonus', 'festivalBonus',
      'loan', 'other', 'notes', 'status'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        payroll[field] = req.body[field];
      }
    });

    // If status is being approved, set approval details
    if (req.body.status === 'APPROVED') {
      payroll.approvedBy = req.user.id;
      payroll.approvedDate = new Date();
    }

    await payroll.save();

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

    // Check authorization
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({ userId: req.user.id });
      if (!employee || employee._id.toString() !== payroll.employeeId._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this salary slip'
        });
      }
    } else if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to generate salary slip'
      });
    }

    // Create PDF
    const doc = new PDFDocument();
    const filename = `salary-slip-${payroll.employeeId.fullName}-${payroll.month}-${payroll.year}.pdf`;
    const filepath = path.join(__dirname, '../uploads/salary-slips/', filename);
    
    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write PDF to file
    doc.pipe(fs.createWriteStream(filepath));
    doc.pipe(res);

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // PDF Header
    doc.fontSize(20).text('SALARY SLIP', { align: 'center' });
    doc.moveDown();

    // Company Info
    doc.fontSize(14).text('Company Name: Your Company Name', { align: 'center' });
    doc.text('Address: Your Company Address', { align: 'center' });
    doc.moveDown();

    // Employee Info
    doc.fontSize(12);
    doc.text(`Employee Name: ${payroll.employeeId.fullName}`, 50, doc.y);
    doc.text(`Employee ID: ${payroll.employeeId._id}`, 300, doc.y);
    doc.moveDown();
    
    doc.text(`Email: ${payroll.employeeId.email}`, 50, doc.y);
    doc.text(`Phone: ${payroll.employeeId.phoneNumber || 'N/A'}`, 300, doc.y);
    doc.moveDown();
    
    doc.text(`Department: ${payroll.employeeId.department?.name || 'N/A'}`, 50, doc.y);
    doc.text(`Month/Year: ${payroll.monthName} ${payroll.year}`, 300, doc.y);
    doc.moveDown();

    // Attendance Summary
    doc.fontSize(14).text('ATTENDANCE SUMMARY', { underline: true });
    doc.fontSize(12);
    doc.text(`Working Days: ${payroll.workingDays}`, 50, doc.y);
    doc.text(`Present Days: ${payroll.presentDays}`, 200, doc.y);
    doc.text(`Absent Days: ${payroll.absentDays}`, 350, doc.y);
    doc.moveDown();
    
    doc.text(`Half Days: ${payroll.halfDays}`, 50, doc.y);
    doc.text(`Overtime Hours: ${payroll.overtimeHours}`, 200, doc.y);
    doc.moveDown();

    // Earnings
    doc.fontSize(14).text('EARNINGS', { underline: true });
    doc.fontSize(12);
    
    const earnings = [
      ['Basic Salary', `₹${payroll.basicAmount.toFixed(2)}`],
      ['House Rent Allowance (HRA)', `₹${payroll.hra.toFixed(2)}`],
      ['Dearness Allowance (DA)', `₹${payroll.da.toFixed(2)}`],
      ['Conveyance Allowance', `₹${payroll.conveyanceAllowance.toFixed(2)}`],
      ['Medical Allowance', `₹${payroll.medicalAllowance.toFixed(2)}`],
      ['Special Allowance', `₹${payroll.specialAllowance.toFixed(2)}`],
      ['Overtime Amount', `₹${payroll.overtimeAmount.toFixed(2)}`],
      ['Performance Bonus', `₹${payroll.performanceBonus.toFixed(2)}`],
      ['Project Bonus', `₹${payroll.projectBonus.toFixed(2)}`],
      ['Attendance Bonus', `₹${payroll.attendanceBonus.toFixed(2)}`],
      ['Festival Bonus', `₹${payroll.festivalBonus.toFixed(2)}`]
    ];

    earnings.forEach(([label, amount]) => {
      doc.text(label, 50, doc.y);
      doc.text(amount, 400, doc.y);
      doc.moveDown(0.5);
    });

    doc.text('GROSS SALARY', 50, doc.y);
    doc.text(`₹${payroll.grossSalary.toFixed(2)}`, 400, doc.y);
    doc.moveDown();

    // Deductions
    doc.fontSize(14).text('DEDUCTIONS', { underline: true });
    doc.fontSize(12);
    
    const deductions = [
      ['Provident Fund (PF)', `₹${payroll.pf.toFixed(2)}`],
      ['Employee State Insurance (ESI)', `₹${payroll.esi.toFixed(2)}`],
      ['Professional Tax', `₹${payroll.tax.toFixed(2)}`],
      ['Loan Recovery', `₹${payroll.loan.toFixed(2)}`],
      ['Other Deductions', `₹${payroll.other.toFixed(2)}`]
    ];

    deductions.forEach(([label, amount]) => {
      doc.text(label, 50, doc.y);
      doc.text(amount, 400, doc.y);
      doc.moveDown(0.5);
    });

    doc.text('TOTAL DEDUCTIONS', 50, doc.y);
    doc.text(`₹${payroll.totalDeductions.toFixed(2)}`, 400, doc.y);
    doc.moveDown();

    // Net Salary
    doc.fontSize(16).text('NET SALARY', 50, doc.y);
    doc.text(`₹${payroll.netSalary.toFixed(2)}`, 400, doc.y);
    doc.moveDown();

    // Footer
    doc.fontSize(10);
    doc.text('This is a computer generated salary slip and does not require signature.', { align: 'center' });
    doc.text(`Generated on: ${new Date().toDateString()}`, { align: 'center' });

    // Update payroll with salary slip path
    payroll.salarySlipPath = filepath;
    await payroll.save();

    doc.end();
  } catch (error) {
    console.error('Generate salary slip error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during salary slip generation'
    });
  }
};

// @desc    Get salary slip download link
// @route   GET /api/payroll/:id/download
// @access  Private
exports.downloadSalarySlip = async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    // Check authorization
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({ userId: req.user.id });
      if (!employee || employee._id.toString() !== payroll.employeeId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to download this salary slip'
        });
      }
    } else if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to download salary slip'
      });
    }

    if (!payroll.salarySlipPath || !fs.existsSync(payroll.salarySlipPath)) {
      return res.status(404).json({
        success: false,
        message: 'Salary slip file not found. Please generate it first.'
      });
    }

    // Send file
    res.download(payroll.salarySlipPath);
  } catch (error) {
    console.error('Download salary slip error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during salary slip download'
    });
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