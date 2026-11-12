const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Holiday = require('../models/Holiday');
const { notifyAdmins } = require("../services/notificationService");
const trackChanges = require("../utils/changeTracker");

// Helper: Normalize any date to UTC Midnight for the IST (Asia/Kolkata) calendar day
// Biometric records and system standards use YYYY-MM-DDT00:00:00.000Z
const getTodayUtcMidnight = () => {
  const istDateStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // "YYYY-MM-DD"
  return new Date(`${istDateStr}T00:00:00.000Z`);
};

const getNormalizedDate = (dateInput) => {
  if (!dateInput) return getTodayUtcMidnight();
  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return new Date(`${trimmed}T00:00:00.000Z`);
    }
    const slashParts = trimmed.split("/");
    if (slashParts.length === 3) {
      return new Date(
        `${slashParts[2]}-${slashParts[1].padStart(2, "0")}-${slashParts[0].padStart(2, "0")}T00:00:00.000Z`
      );
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return getTodayUtcMidnight();
  const istDateStr = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Date(`${istDateStr}T00:00:00.000Z`);
};

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

    // Get today's normalized UTC midnight date for Asia/Kolkata
    const today = getTodayUtcMidnight();
    const legacyIstMidnight = new Date(today.getTime() - 5.5 * 3600 * 1000);

    // Check if already checked in today (check both normalized and legacy offset)
    const existingAttendance = await Attendance.findOne({
      employeeId: employee._id,
      $or: [
        { date: today },
        { date: legacyIstMidnight }
      ]
    });

    if (existingAttendance) {
      if (existingAttendance.checkIn) {
        return res.status(400).json({
          success: false,
          message: 'Already checked in for today'
        });
      }
      // If a placeholder existed without checkIn time, record the checkIn
      existingAttendance.checkIn = new Date();
      existingAttendance.date = today;
      existingAttendance.status = existingAttendance.status || 'PRESENT';
      if (notes) existingAttendance.notes = notes;
      existingAttendance.source = existingAttendance.source || 'MANUAL';
      await existingAttendance.save();

      return res.status(200).json({
        success: true,
        data: existingAttendance,
        message: 'Check-in successful'
      });
    }

    // Create new attendance record with normalized UTC midnight date
    const attendance = await Attendance.create({
      employeeId: employee._id,
      userId: req.user.id,
      date: today,
      checkIn: new Date(),
      status: 'PRESENT',
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

    // Get today's normalized UTC midnight date
    const today = getTodayUtcMidnight();
    const legacyIstMidnight = new Date(today.getTime() - 5.5 * 3600 * 1000);

    // Find today's attendance record
    const attendance = await Attendance.findOne({
      employeeId: employee._id,
      $or: [
        { date: today },
        { date: legacyIstMidnight }
      ]
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
    const checkOutTime = new Date();
    attendance.checkOut = checkOutTime;
    attendance.date = today; // Normalize date to UTC midnight if it was legacy
    if (notes) attendance.notes = notes;
    attendance.source = attendance.source || 'MANUAL';

    // Calculate total hours if checkIn exists
    if (attendance.checkIn) {
      const diffMs = checkOutTime - new Date(attendance.checkIn);
      const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
      attendance.totalHours = totalHours;
      if (totalHours >= 8) {
        attendance.status = 'PRESENT';
      } else if (totalHours >= 4 && attendance.status !== 'PRESENT') {
        attendance.status = 'HALF_DAY';
      }
    }
    
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

    // Get today's normalized UTC midnight date
    const today = getTodayUtcMidnight();
    const legacyIstMidnight = new Date(today.getTime() - 5.5 * 3600 * 1000);

    // Find today's attendance
    const attendance = await Attendance.findOne({
      employeeId: employee._id,
      $or: [
        { date: today },
        { date: legacyIstMidnight }
      ]
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
      const parsedMonth = parseInt(month);
      const parsedYear = parseInt(year);
      const startDate = new Date(Date.UTC(parsedYear, parsedMonth - 1, 1, 0, 0, 0, 0));
      const nextMonthStart = new Date(Date.UTC(parsedYear, parsedMonth, 1, 0, 0, 0, 0));
      const legacyStart = new Date(startDate.getTime() - 6 * 3600 * 1000);
      query.date = { $gte: legacyStart, $lt: nextMonthStart };
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

    const { date, employeeId, department, branchId, page = 1, limit = 50 } = req.query;

    // Build query
    let query = {};
    
    if (date) {
      const startOfDay = getNormalizedDate(date);
      const endOfDay = new Date(startOfDay.getTime() + 24 * 3600 * 1000);
      const legacyIstMidnight = new Date(startOfDay.getTime() - 5.5 * 3600 * 1000);
      
      query.$or = [
        { date: { $gte: startOfDay, $lt: endOfDay } },
        { date: legacyIstMidnight }
      ];
      
      console.log('Attendance query date range:', {
        from: startOfDay.toISOString(),
        to: endOfDay.toISOString(),
        legacyIstMidnight: legacyIstMidnight.toISOString(),
        input: date
      });
    }

    if (branchId) {
      const branchEmployees = await Employee.find({ branchId }).select('_id');
      const branchEmpIds = branchEmployees.map(e => e._id);
      if (employeeId) {
        if (branchEmpIds.some(id => id.toString() === employeeId.toString())) {
          query.employeeId = employeeId;
        } else {
          query.employeeId = { $in: [] };
        }
      } else {
        query.employeeId = { $in: branchEmpIds };
      }
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    // Get attendance records
    const skip = (page - 1) * limit;
    const attendance = await Attendance.find(query)
      .populate({
        path: 'employeeId',
        select: 'fullName email department branchId',
        populate: [
          { path: 'department', select: 'name' },
          { path: 'branchId', select: 'name code city state' },
        ]
      })
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

    const normalizedDate = getNormalizedDate(date);
    const legacyIstMidnight = new Date(normalizedDate.getTime() - 5.5 * 3600 * 1000);

    // Check if attendance record already exists for this employee and date
    const existingAttendance = await Attendance.findOne({
      employeeId,
      $or: [
        { date: normalizedDate },
        { date: legacyIstMidnight }
      ]
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
      date: normalizedDate,
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

    // Date range for the month using UTC bounds
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const nextMonthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const legacyStart = new Date(startDate.getTime() - 6 * 3600 * 1000);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    
    // Fetch all attendance records for the month
    const attendanceRecords = await Attendance.find({
      employeeId: employee._id,
      date: { $gte: legacyStart, $lt: nextMonthStart }
    }).sort({ date: 1 });

    // Fetch holidays for the month
    const holidays = await Holiday.find({
      date: { $gte: legacyStart, $lt: nextMonthStart }
    });
    const holidayDates = new Set(
      holidays.map(h => new Date(h.date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }))
    );

    // Accurate calculation based on each day of the month
    let presentDays = 0;
    let absentDays = 0;
    let halfDays = 0;
    let totalHours = 0;

    // Helper for local-safe date key to avoid timezone shifts
    const toDateKey = (dateInput) => {
      const d = new Date(dateInput);
      return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    };

    // Pre-index attendance records in a Map by their date key for O(1) lookups
    const attendanceMap = new Map();
    attendanceRecords.forEach(record => {
      if (record && record.date) {
        attendanceMap.set(toDateKey(record.date), record);
      }
    });

    const todayDateKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    // Loop through each day of the month
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0');
      const monthStr = String(month).padStart(2, '0');
      const dateKey = `${year}-${monthStr}-${dayStr}`;
      const currentDay = new Date(`${dateKey}T00:00:00.000Z`);
      const dayOfWeek = currentDay.getUTCDay(); // 0 is Sunday, 6 is Saturday
      
      const record = attendanceMap.get(dateKey);

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
          if (dateKey < todayDateKey) {
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

    // Ensure we're working with UTC midnight to avoid timezone issues
    const startOfDay = getNormalizedDate(date);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 3600 * 1000);
    const legacyIstMidnight = new Date(startOfDay.getTime() - 5.5 * 3600 * 1000);

    const results = [];
    const errors = [];

    // 1. Fetch all existing attendance records for the target employees on the target date
    const existingAttendance = await Attendance.find({
      employeeId: { $in: employeeIds },
      $or: [
        { date: { $gte: startOfDay, $lt: endOfDay } },
        { date: legacyIstMidnight }
      ]
    });

    const existingMap = new Map(existingAttendance.map(att => [att.employeeId.toString(), att]));

    // 2. Identify missing employee IDs and fetch their user IDs
    const missingEmpIds = employeeIds.filter(empId => !existingMap.has(empId.toString()));
    let employeeMap = new Map();
    if (missingEmpIds.length > 0) {
      const employees = await Employee.find({ _id: { $in: missingEmpIds } }).select('_id userId');
      employeeMap = new Map(employees.map(emp => [emp._id.toString(), emp]));
    }

    // 3. Prepare bulk operations
    const bulkOps = [];
    const processedEmployeeIds = [];

    for (const employeeId of employeeIds) {
      const empIdStr = employeeId.toString();
      const existing = existingMap.get(empIdStr);

      if (existing) {
        processedEmployeeIds.push(employeeId);
        bulkOps.push({
          updateOne: {
            filter: { _id: existing._id },
            update: {
              $set: {
                status,
                date: startOfDay,
                notes: notes !== undefined ? notes : existing.notes,
                approvedBy: req.user.id,
                source: 'MANUAL'
              }
            }
          }
        });
      } else {
        const employee = employeeMap.get(empIdStr);
        if (!employee) {
          errors.push({ employeeId, message: 'Employee not found' });
          continue;
        }
        processedEmployeeIds.push(employeeId);
        bulkOps.push({
          insertOne: {
            document: {
              employeeId,
              userId: employee.userId || null,
              date: startOfDay,
              status,
              notes: notes || '',
              approvedBy: req.user.id,
              isAdminCreated: true,
              source: 'MANUAL'
            }
          }
        });
      }
    }

    // 4. Execute bulkWrite if there are operations to run
    if (bulkOps.length > 0) {
      await Attendance.bulkWrite(bulkOps);

      // 5. Fetch updated/inserted records to return in response to maintain API contract compatibility
      const updatedRecords = await Attendance.find({
        employeeId: { $in: processedEmployeeIds },
        $or: [
          { date: { $gte: startOfDay, $lt: endOfDay } },
          { date: legacyIstMidnight }
        ]
      });
      results.push(...updatedRecords);
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
 