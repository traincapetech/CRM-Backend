const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const User = require('../models/User');

// @desc    Check-in employee
// @route   POST /api/attendance/checkin
// @access  Private
exports.checkIn = async (req, res) => {
  try {
    const { notes } = req.body;
    
    // Find employee record
    const employee = await Employee.findOne({ userId: req.user.id });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }

    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already checked in today
    const existingAttendance = await Attendance.findOne({
      employeeId: employee._id,
      date: today
    });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: 'Already checked in for today'
      });
    }

    // Create new attendance record
    const attendance = await Attendance.create({
      employeeId: employee._id,
      userId: req.user.id,
      date: today,
      checkIn: new Date(),
      notes: notes || ''
    });

    res.status(201).json({
      success: true,
      data: attendance,
      message: 'Check-in successful'
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during check-in'
    });
  }
};

// @desc    Check-out employee
// @route   PUT /api/attendance/checkout
// @access  Private
exports.checkOut = async (req, res) => {
  try {
    const { notes } = req.body;
    
    // Find employee record
    const employee = await Employee.findOne({ userId: req.user.id });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }

    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find today's attendance record
    const attendance = await Attendance.findOne({
      employeeId: employee._id,
      date: today
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'No check-in found for today'
      });
    }

    if (attendance.checkOut) {
      return res.status(400).json({
        success: false,
        message: 'Already checked out for today'
      });
    }

    // Update attendance with check-out time
    attendance.checkOut = new Date();
    if (notes) attendance.notes = notes;
    
    await attendance.save();

    res.status(200).json({
      success: true,
      data: attendance,
      message: 'Check-out successful'
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during check-out'
    });
  }
};

// @desc    Get attendance status for today
// @route   GET /api/attendance/today
// @access  Private
exports.getTodayAttendance = async (req, res) => {
  try {
    console.log('Getting today attendance for user:', req.user.id);
    
    // Find employee record
    const employee = await Employee.findOne({ userId: req.user.id });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }

    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find today's attendance
    const attendance = await Attendance.findOne({
      employeeId: employee._id,
      date: today
    });

    console.log('Found attendance:', attendance ? attendance._id : 'None');
    res.status(200).json({
      success: true,
      data: attendance,
      hasCheckedIn: !!attendance,
      hasCheckedOut: !!(attendance && attendance.checkOut)
    });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get attendance history
// @route   GET /api/attendance/history
// @access  Private
exports.getAttendanceHistory = async (req, res) => {
  try {
    const { month, year, page = 1, limit = 30 } = req.query;
    
    // Find employee record
    const employee = await Employee.findOne({ userId: req.user.id });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }

    // Build query
    let query = { employeeId: employee._id };
    
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      query.date = { $gte: startDate, $lte: endDate };
    }

    // Get attendance records with pagination
    const skip = (page - 1) * limit;
    const attendance = await Attendance.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Attendance.countDocuments(query);

    // Calculate statistics
    const stats = {
      totalDays: attendance.length,
      presentDays: attendance.filter(a => a.status === 'PRESENT').length,
      halfDays: attendance.filter(a => a.status === 'HALF_DAY').length,
      lateDays: attendance.filter(a => a.status === 'LATE').length,
      totalHours: attendance.reduce((sum, a) => sum + (a.totalHours || 0), 0)
    };

    res.status(200).json({
      success: true,
      data: attendance,
      stats: stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get attendance history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get all employees attendance (Admin/HR only)
// @route   GET /api/attendance/all
// @access  Private (Admin/HR/Manager)
exports.getAllAttendance = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view all attendance'
      });
    }

    const { date, employeeId, department, page = 1, limit = 50 } = req.query;

    // Build query
    let query = {};
    
    if (date) {
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      query.date = queryDate;
    }

    if (employeeId) {
      query.employeeId = employeeId;
    }

    // Get attendance records
    const skip = (page - 1) * limit;
    const attendance = await Attendance.find(query)
      .populate('employeeId', 'fullName email department')
      .populate('userId', 'fullName email')
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Filter by department if specified
    let filteredAttendance = attendance;
    if (department) {
      filteredAttendance = attendance.filter(a => 
        a.employeeId && a.employeeId.department && 
        a.employeeId.department.toString() === department
      );
    }

    // Get total count
    const total = await Attendance.countDocuments(query);

    res.status(200).json({
      success: true,
      data: filteredAttendance,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create attendance record (Admin/HR only)
// @route   POST /api/attendance
// @access  Private (Admin/HR/Manager)
exports.createAttendance = async (req, res) => {
  try {
    console.log('=== CREATE ATTENDANCE DEBUG ===');
    console.log('Request body:', req.body);
    console.log('User role:', req.user.role);
    console.log('User ID:', req.user.id);
    
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create attendance records'
      });
    }

    const { employeeId, date, status, notes, checkIn, checkOut } = req.body;

    // Validate required fields
    if (!employeeId || !date || !status) {
      console.log('Validation failed - employeeId:', employeeId, 'date:', date, 'status:', status);
      return res.status(400).json({
        success: false,
        message: 'Employee ID, date, and status are required'
      });
    }

    // Check if attendance record already exists for this employee and date
    const existingAttendance = await Attendance.findOne({
      employeeId,
      date: new Date(date)
    });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: 'Attendance record already exists for this employee and date'
      });
    }

    // Find the employee
    const employee = await Employee.findById(employeeId);
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Create attendance record
    const attendanceData = {
      employeeId,
      userId: employee.userId || null, // Can be null for admin-created records
      date: new Date(date),
      status,
      notes: notes || '',
      approvedBy: req.user.id,
      isAdminCreated: true // Mark as admin-created
    };

    // Add check-in/check-out times if provided
    if (checkIn) attendanceData.checkIn = new Date(checkIn);
    if (checkOut) attendanceData.checkOut = new Date(checkOut);

    const attendance = new Attendance(attendanceData);
    await attendance.save();

    res.status(201).json({
      success: true,
      data: attendance,
      message: 'Attendance record created successfully'
    });
  } catch (error) {
    console.error('Error creating attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Update attendance (Admin/HR only)
// @route   PUT /api/attendance/:id
// @access  Private (Admin/HR/Manager)
exports.updateAttendance = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update attendance'
      });
    }

    const { status, notes, totalHours } = req.body;

    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    // Update fields
    if (status) attendance.status = status;
    if (notes) attendance.notes = notes;
    if (totalHours) attendance.totalHours = totalHours;
    
    attendance.approvedBy = req.user.id;
    
    await attendance.save();

    res.status(200).json({
      success: true,
      data: attendance,
      message: 'Attendance updated successfully'
    });
  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get monthly attendance summary
// @route   GET /api/attendance/summary/:month/:year
// @access  Private
exports.getMonthlyAttendanceSummary = async (req, res) => {
  try {
    const { month, year } = req.params;
    
    // Find employee record
    const employee = await Employee.findOne({ userId: req.user.id });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }

    // Get date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    // Get attendance records for the month
    const attendance = await Attendance.find({
      employeeId: employee._id,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });

    // Calculate summary
    const workingDays = endDate.getDate();
    const presentDays = attendance.filter(a => a.status === 'PRESENT').length;
    const halfDays = attendance.filter(a => a.status === 'HALF_DAY').length;
    const lateDays = attendance.filter(a => a.status === 'LATE').length;
    const absentDays = workingDays - attendance.length;
    const totalHours = attendance.reduce((sum, a) => sum + (a.totalHours || 0), 0);
    const overtimeHours = attendance.reduce((sum, a) => sum + (a.overtimeHours || 0), 0);

    const summary = {
      month: parseInt(month),
      year: parseInt(year),
      workingDays,
      presentDays,
      halfDays,
      lateDays,
      absentDays,
      totalHours: Math.round(totalHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      attendancePercentage: Math.round((presentDays / workingDays) * 100 * 100) / 100,
      dailyAttendance: attendance
    };

    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get monthly attendance summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
}; 