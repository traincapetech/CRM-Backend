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
    const workingDays = endDate.getDate(); // Total days in the month
    const presentDays = attendance.filter(a => a.status === 'PRESENT').length;
    const halfDays = attendance.filter(a => a.status === 'HALF_DAY').length;
    const absentDays = workingDays - presentDays - halfDays; // Correct calculation
    const overtimeHours = attendance.reduce((sum, a) => sum + (a.overtimeHours || 0), 0);

    console.log('📅 Attendance Summary Calculation:', {
      workingDays,
      presentDays,
      halfDays,
      absentDays,
      overtimeHours
    });

    // Get approved incentives for the month (optional - can be overridden manually)
    const incentives = await Incentive.getIncentivesForPayroll(employeeId, month, year);
    
    // Calculate incentive amounts (as fallback values)
    const autoPerformanceBonus = incentives
      .filter(i => i.type === 'PERFORMANCE')
      .reduce((sum, i) => sum + i.amount, 0);
    
    const autoProjectBonus = incentives
      .filter(i => i.type === 'PROJECT')
      .reduce((sum, i) => sum + i.amount, 0);
    
    const autoFestivalBonus = incentives
      .filter(i => i.type === 'FESTIVAL')
      .reduce((sum, i) => sum + i.amount, 0);

    // Create payroll record - use manual values if provided, otherwise use calculated values
    const payrollData = {
      employeeId,
      userId: employee.userId,
      month,
      year,
      baseSalary: req.body.baseSalary || employee.salary,
      daysPresent: req.body.daysPresent || presentDays,
      calculatedSalary: req.body.calculatedSalary || ((req.body.baseSalary || employee.salary) / 30) * (req.body.daysPresent || presentDays),
      // Use manual values for attendance if provided, otherwise use calculated values
      workingDays: req.body.workingDays || workingDays,
      presentDays: req.body.daysPresent || presentDays,
      absentDays: req.body.workingDays && req.body.daysPresent ? (30 - req.body.daysPresent) : (30 - presentDays),
      halfDays: req.body.halfDays || halfDays,
      overtimeHours: req.body.overtimeHours || overtimeHours,
      // Manual Allowances
      hra: req.body.hra || 0,
      da: req.body.da || 0,
      conveyanceAllowance: req.body.conveyanceAllowance || 0,
      medicalAllowance: req.body.medicalAllowance || 0,
      specialAllowance: req.body.specialAllowance || 0,
      overtimeAmount: req.body.overtimeAmount || 0,
      // Bonuses
      performanceBonus: req.body.performanceBonus || autoPerformanceBonus,
      projectBonus: req.body.projectBonus || autoProjectBonus,
      attendanceBonus: req.body.attendanceBonus || 0,
      festivalBonus: req.body.festivalBonus || autoFestivalBonus,
      // Manual Deductions
      pf: req.body.pf || 0,
      esi: req.body.esi || 0,
      tax: req.body.tax || 0,
      loan: req.body.loan || 0,
      other: req.body.other || 0,
      notes: req.body.notes || ''
    };

    console.log('💾 Final Payroll Data:', {
      workingDays: payrollData.workingDays,
      presentDays: payrollData.presentDays,
      absentDays: payrollData.absentDays,
      halfDays: payrollData.halfDays
    });

    const payroll = await Payroll.create(payrollData);

    // Trigger salary calculation
    await payroll.save();

    // Update incentives with payroll reference
    if (incentives.length > 0) {
      await Incentive.updateMany(
        { _id: { $in: incentives.map(i => i._id) } },
        { payrollId: payroll._id }
      );
    }

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
    doc.text(`Department: ${payroll.employeeId.department || 'N/A'}`);
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
        message: 'Server error while generating salary slip'
      });
    }
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