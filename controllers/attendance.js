const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Holiday = require('../models/Holiday');
const { notifyAdmins } = require("../services/notificationService");
const trackChanges = require("../utils/changeTracker");

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
      notes: notes || '',
      source: 'MANUAL'
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
    attendance.source = attendance.source || 'MANUAL';
    
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
      // Handle date in various formats (ISO, dd/mm/yyyy, etc.)
      let queryDate;
      if (typeof date === 'string' && date.includes('/')) {
        // Handle dd/mm/yyyy or mm/dd/yyyy format
        const parts = date.split('/');
        if (parts.length === 3) {
          // Assume dd/mm/yyyy format (common in India/UK)
          queryDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00.000Z`);
        } else {
          queryDate = new Date(date);
        }
      } else if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // ISO date format (YYYY-MM-DD) - treat as UTC midnight
        queryDate = new Date(`${date}T00:00:00.000Z`);
      } else {
        queryDate = new Date(date);
      }
      
      // Ensure we're working with UTC dates to avoid timezone issues
      const startOfDay = new Date(Date.UTC(
        queryDate.getUTCFullYear(),
        queryDate.getUTCMonth(),
        queryDate.getUTCDate(),
        0, 0, 0, 0
      ));
      
      const endOfDay = new Date(Date.UTC(
        queryDate.getUTCFullYear(),
        queryDate.getUTCMonth(),
        queryDate.getUTCDate() + 1,
        0, 0, 0, 0
      ));
      
      query.date = {
        $gte: startOfDay,
        $lt: endOfDay
      };
      
      console.log('Attendance query date range:', {
        from: startOfDay.toISOString(),
        to: endOfDay.toISOString(),
        input: date
      });
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
      isAdminCreated: true, // Mark as admin-created
      source: 'MANUAL'
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

    const oldAttendance = attendance.toObject();

    if (attendance.source === 'BIOMETRIC' && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Biometric attendance is read-only for non-admins'
      });
    }

    // Update fields
    if (status) attendance.status = status;
    if (notes) attendance.notes = notes;
    if (totalHours) attendance.totalHours = totalHours;
    
    attendance.approvedBy = req.user.id;
    
    await attendance.save();

    // Detailed Admin Notification
    const fieldLabels = {
      status: "Status",
      notes: "Notes",
      totalHours: "Total Hours"
    };

    const changes = trackChanges(oldAttendance, attendance.toObject(), fieldLabels);
    if (changes.length > 0) {
      await notifyAdmins({
        type: "ATTENDANCE_UPDATED",
        message: `${req.user.fullName} updated attendance record. Changes: ${changes.join(", ")}`,
        attendanceId: attendance._id
      });
    }

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
    const { month: monthStr, year: yearStr } = req.params;
    const { employeeId } = req.query;
    const month = parseInt(monthStr);
    const year = parseInt(yearStr);
    
    let employee;
    
    // Authorization check
    if (employeeId && ['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      employee = await Employee.findById(employeeId).populate('role department');
    } else {
      employee = await Employee.findOne({ userId: req.user.id }).populate('role department');
    }

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }

    // Date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of month
    const daysInMonth = endDate.getDate();
    
    // Fetch all attendance records for the month
    const attendanceRecords = await Attendance.find({
      employeeId: employee._id,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });

    // Fetch holidays for the month
    const holidays = await Holiday.find({
      date: { $gte: startDate, $lte: endDate }
    });
    const holidayDates = new Set(holidays.map(h => h.date.toISOString().split('T')[0]));

    // Accurate calculation based on each day of the month
    let presentDays = 0;
    let absentDays = 0;
    let halfDays = 0;
    let totalHours = 0;

    // Helper for local-safe date key to avoid timezone shifts
    const toLocaleISOString = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    // Loop through each day of the month
    for (let d = 1; d <= daysInMonth; d++) {
      const currentDay = new Date(year, month - 1, d);
      const dateKey = toLocaleISOString(currentDay);
      const dayOfWeek = currentDay.getDay(); // 0 is Sunday, 6 is Saturday
      
      const record = attendanceRecords.find(r => 
        toLocaleISOString(r.date) === dateKey
      );

      // Rule Analysis:
      // 1. Is it a holiday?
      const isHoliday = holidayDates.has(dateKey);
      
      // 2. Is it a weekend?
      let isWeekend = false;
      if (employee.employmentType === 'INTERN') {
        isWeekend = (dayOfWeek === 0 || dayOfWeek === 6); // Sun or Sat
      } else {
        isWeekend = (dayOfWeek === 0); // Only Sun
      }

      if (record) {
        if (record.status === 'HALF_DAY') {
          halfDays++;
        } else if (['PRESENT', 'LATE', 'EARLY_LEAVE'].includes(record.status)) {
          presentDays++;
        } else if (record.status === 'ABSENT') {
          // Explicit absence on a working day that is not a holiday
          if (!isWeekend && !isHoliday) {
            absentDays++;
          }
        }
        totalHours += (record.totalHours || 0);
      } else {
        // No record exists. 
        // We only count as absence if it's NOT a weekend and NOT a holiday
        if (!isWeekend && !isHoliday) {
          // Check if it's in the past (to avoid counting future days as absent)
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (currentDay < today) {
            absentDays++;
          }
        }
      }
    }

    const summary = {
      month,
      year,
      totalDays: daysInMonth, // Total days in the month (basis for display)
      presentDays,
      absentDays,
      halfDays,
      totalHours: Math.round(totalHours * 100) / 100,
      attendancePercentage: Math.round(((presentDays + (halfDays * 0.5)) / daysInMonth) * 100 * 100) / 100
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

// @desc    Bulk mark attendance (Admin/HR only)
// @route   POST /api/attendance/bulk
// @access  Private (Admin/HR/Manager)
exports.bulkMarkAttendance = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to bulk mark attendance'
      });
    }

    const { employeeIds, date, status, notes } = req.body;

    // Validate required fields
    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0 || !date || !status) {
      return res.status(400).json({
        success: false,
        message: 'Employee IDs (array), date, and status are required'
      });
    }

    // Parse the input date
    const inputDate = new Date(date);
    
    // Ensure we're working with UTC midnight to avoid timezone issues
    // Use the input date's year, month, and day for UTC midnight
    const startOfDay = new Date(Date.UTC(
      inputDate.getFullYear(),
      inputDate.getMonth(),
      inputDate.getDate(),
      0, 0, 0, 0
    ));

    const results = [];
    const errors = [];

    // Process each employee
    for (const employeeId of employeeIds) {
      try {
        const endOfDay = new Date(startOfDay);
        endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

        let attendance = await Attendance.findOne({
          employeeId,
          date: {
            $gte: startOfDay,
            $lt: endOfDay
          }
        });

        if (attendance) {
          // Update existing
          attendance.status = status;
          if (notes !== undefined) attendance.notes = notes;
          attendance.approvedBy = req.user.id;
          attendance.source = 'MANUAL';
          await attendance.save();
          results.push(attendance);
        } else {
          // Create new
          const employee = await Employee.findById(employeeId);
          if (!employee) {
            errors.push({ employeeId, message: 'Employee not found' });
            continue;
          }

          attendance = await Attendance.create({
            employeeId,
            userId: employee.userId || null,
            date: startOfDay,
            status,
            notes: notes || '',
            approvedBy: req.user.id,
            isAdminCreated: true,
            source: 'MANUAL'
          });
          results.push(attendance);
        }
      } catch (err) {
        console.error(`Error processing bulk attendance for employee ${employeeId}:`, err);
        errors.push({ employeeId, message: err.message });
      }
    }

    res.status(200).json({
      success: true,
      message: `Successfully processed ${results.length} attendance records`,
      data: results,
      totalProcessed: results.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Bulk attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk attendance update',
      error: error.message
    });
  }
};
 