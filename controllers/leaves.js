const FeedService = require("../services/feedService");
const Leave = require("../models/Leave");
const Employee = require("../models/Employee");
const User = require("../models/User");
const Attendance = require("../models/Attendance");
const Holiday = require("../models/Holiday");
const mongoose = require("mongoose");
const { notifyAdmins } = require("../services/notificationService");
const trackChanges = require("../utils/changeTracker");

/**
 * Helper to sync approved leave dates into attendance records
 */
const syncLeaveToAttendance = async (leave, approvingUserId) => {
  try {
    const { employeeId, startDate, endDate, leaveType, isHalfDay } = leave;
    
    // Get full employee record to check employmentType for weekend logic
    const employee = await Employee.findById(employeeId);
    if (!employee) return;

    // Fetch holidays that might overlap with this leave
    const holidays = await Holiday.find({
      date: { $gte: startDate, $lte: endDate }
    });
    const holidayDates = new Set(holidays.map(h => h.date.toDateString()));

    // Iterate through every date in the leave period
    let currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0); // Normalize to local midnight
    
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay(); // 0 is Sunday, 6 is Saturday
      
      // Determine if it's a weekend for this specific employee
      let isWeekend = false;
      if (employee.employmentType === 'INTERN') {
        isWeekend = (dayOfWeek === 0 || dayOfWeek === 6); // Sun or Sat
      } else {
        isWeekend = (dayOfWeek === 0); // Only Sun
      }

      // Skip sync only if it's a weekend or a holiday
      if (!isWeekend && !holidayDates.has(currentDate.toDateString())) {
        // Prepare UTC Normalized date for Attendance record (following attendance controller pattern)
        const attendanceDate = new Date(Date.UTC(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          currentDate.getDate(),
          0, 0, 0, 0
        ));

        // Note: attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
        // Use findOneAndUpdate with upsert to avoid duplicate key errors
        await Attendance.findOneAndUpdate(
          { employeeId, date: attendanceDate },
          {
            $setOnInsert: {
              userId: employee.userId || null,
              isAdminCreated: true,
              source: 'MANUAL',
            },
            $set: {
              status: isHalfDay ? 'HALF_DAY' : 'ON_LEAVE',
              notes: `Approved ${leaveType.toUpperCase()} Leave${isHalfDay ? ' (Half Day)' : ''}`,
              approvedBy: approvingUserId
            }
          },
          { upsert: true, new: true }
        );
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
  } catch (error) {
    console.error("Sync Leave to Attendance failed:", error);
    // Don't throw - we don't want to fail the leave approval if sync fails
  }
};

// @desc    Get my leaves
// @route   GET /api/leaves/my-leaves
// @access  Private
exports.getMyLeaves = async (req, res) => {
  try {
    console.log("Getting leaves for user:", req.user.id);
    const employee = await Employee.findOne({ userId: req.user.id });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee record not found",
      });
    }

    // Find leaves by both employeeId and userId
    const leaves = await Leave.find({
      $or: [{ employeeId: employee._id }, { userId: req.user.id }],
    }).sort({ createdAt: -1 });

    console.log(`Found ${leaves.length} leaves for employee:`, employee._id);
    res.json({
      success: true,
      data: leaves,
    });
  } catch (error) {
    console.error("Error in getMyLeaves:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get leave balance
// @route   GET /api/leaves/balance
// @access  Private
exports.getLeaveBalance = async (req, res) => {
  try {
    console.log("Getting leave balance for user:", req.user.id);
    const employee = await Employee.findOne({ userId: req.user.id });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee record not found",
      });
    }

    // Default leave balance structure
    const leaveBalance = {
      casual: 12,
      sick: 12,
      earned: 15,
      used: {
        casual: 0,
        sick: 0,
        earned: 0,
      },
    };

    // Calculate used leaves by both employeeId and userId
    const leaves = await Leave.find({
      $or: [{ employeeId: employee._id }, { userId: req.user.id }],
      status: "approved",
      startDate: {
        $gte: new Date(new Date().getFullYear(), 0, 1),
        $lte: new Date(new Date().getFullYear(), 11, 31),
      },
    });

    console.log(
      `Found ${leaves.length} approved leaves for balance calculation`,
    );
    leaves.forEach((leave) => {
      if (leave.leaveType in leaveBalance.used) {
        leaveBalance.used[leave.leaveType] += leave.totalDays;
      }
    });

    // Calculate remaining balance
    const balance = {
      casual: leaveBalance.casual - leaveBalance.used.casual,
      sick: leaveBalance.sick - leaveBalance.used.sick,
      earned: leaveBalance.earned - leaveBalance.used.earned,
    };

    console.log("Leave balance calculated:", balance);
    res.json({
      success: true,
      data: {
        total: leaveBalance,
        used: leaveBalance.used,
        remaining: balance,
      },
    });
  } catch (error) {
    console.error("Error in getLeaveBalance:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get all leaves (admin/manager)
// @route   GET /api/leaves
// @access  Private/Admin
exports.getLeaves = async (req, res) => {
  try {
    const { month, year, status } = req.query;
    let query = {};

    if (status) {
      query.status = status;
    }

    if (month && year) {
      // Find leaves that overlap with the given month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Last day of month
      
      query.$or = [
        { startDate: { $gte: startDate, $lte: endDate } },
        { endDate: { $gte: startDate, $lte: endDate } },
        { startDate: { $lte: startDate }, endDate: { $gte: endDate } }
      ];
    }

    const leaves = await Leave.find(query)
      .populate("employeeId", "fullName email department")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: leaves,
    });
  } catch (error) {
    console.error("Error in getLeaves:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Create leave
// @route   POST /api/leaves
// @access  Private
exports.createLeave = async (req, res) => {
  try {
    console.log("Creating leave - Request body:", req.body);
    console.log("User:", {
      id: req.user.id,
      role: req.user.role,
      email: req.user.email,
    });

    const employee = await Employee.findOne({ userId: req.user.id });
    console.log("Found employee:", employee ? employee._id : "Not found");

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee record not found",
      });
    }

    // Validate dates
    const start = new Date(req.body.startDate);
    const end = new Date(req.body.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Set start date to beginning of day for fair comparison
    const startOfDay = new Date(start);
    startOfDay.setHours(0, 0, 0, 0);

    console.log("Dates:", { start, end, today, startOfDay });

    // Allow today and future dates
    if (startOfDay < today) {
      return res.status(400).json({
        success: false,
        message: "Start date cannot be in the past",
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: "End date must be after start date",
      });
    }

    // Calculate total days
    let totalDays;
    if (req.body.isHalfDay) {
      totalDays = 0.5;
    } else {
      const timeDiff = end.getTime() - start.getTime();
      totalDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
    }

    // Create leave application with both employeeId and userId
    const leaveData = {
      employeeId: employee._id,
      userId: req.user.id,
      leaveType: req.body.leaveType,
      startDate: start,
      endDate: end,
      totalDays: totalDays,
      reason: req.body.reason,
      isHalfDay: req.body.isHalfDay || false,
      halfDaySession: req.body.isHalfDay ? req.body.halfDaySession : undefined,
      status: "pending",
    };
    console.log("Creating leave with data:", leaveData);

    const leave = await Leave.create(leaveData);
    console.log("Leave created:", leave._id);

    // Notify Admins
    await notifyAdmins({
      type: "LEAVE_REQUESTED",
      message: `New Leave Request: ${employee.fullName} (${totalDays} days, ${req.body.leaveType})`,
      leaveId: leave._id
    });

    // FEED INTEGRATION: Notify HR and Admins
    try {
      // 1. Notify Assigned HR
      if (employee.hrId) {
        await FeedService.createAction({
          userId: employee.hrId,
          type: "APPROVAL",
          module: "HR",
          title: "Leave Request Approval",
          subtitle: `${employee.fullName} requested ${totalDays} day(s) leave`,
          priority: 2, // High priority
          sourceCollection: "Leave",
          sourceId: leave._id,
          actionsPayload: {
            link: `/hr/leaves/${leave._id}`,
            primaryAction: "APPROVE",
          },
        });
      }

      // 2. Notify all Admins (Fallback/Oversight)
      const admins = await User.find({ role: "Admin" });
      for (const admin of admins) {
        // Avoid duplicate if Admin is also the assigned HR
        if (employee.hrId && admin._id.toString() === employee.hrId.toString())
          continue;

        await FeedService.createAction({
          userId: admin._id,
          type: "APPROVAL",
          module: "HR",
          title: "Leave Request Approval",
          subtitle: `${employee.fullName} requested ${totalDays} day(s) leave`,
          priority: 2,
          sourceCollection: "Leave",
          sourceId: leave._id,
          actionsPayload: {
            link: `/admin/leaves/${leave._id}`,
            primaryAction: "APPROVE",
          },
        });
      }
    } catch (feedError) {
      console.error("Failed to create Feed Action for Leave:", feedError);
      // Don't fail the request, just log error
    }

    res.status(201).json({
      success: true,
      data: leave,
    });
  } catch (error) {
    console.error("Error in createLeave:", error);
    console.error("Stack trace:", error.stack);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Update leave
// @route   PUT /api/leaves/:id
// @access  Private
exports.updateLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave not found",
      });
    }

    // Only allow update if status is PENDING
    if (leave.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "Cannot update processed leave application",
      });
    }

    const updatedLeave = await Leave.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
    ).populate("employeeId", "fullName");

    // Notify all admins of the leave update
    try {
      await notifyAdmins({
        type: "LEAVE_UPDATED",
        message: `Leave request for ${updatedLeave.employeeId?.fullName || "Employee"} was updated by ${req.user.fullName}. Status: ${updatedLeave.status}, Type: ${updatedLeave.leaveType}`,
        leaveId: updatedLeave._id
      });
    } catch (notifyError) {
      console.error("Admin notification error (non-blocking):", notifyError);
    }

    res.json({
      success: true,
      data: updatedLeave,
    });
  } catch (error) {
    console.error("Error in updateLeave:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Delete leave
// @route   DELETE /api/leaves/:id
// @access  Private
exports.deleteLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id).populate("employeeId", "fullName");
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave not found",
      });
    }

    // Only allow deletion if status is PENDING
    if (leave.status !== "PENDING" && leave.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete processed leave application",
      });
    }

    await leave.remove();

    // Notify all admins of the leave deletion
    try {
      await notifyAdmins({
        type: "ACTIVITY",
        message: `Leave request for ${leave.employeeId?.fullName || "Employee"} (${leave.totalDays} days, ${leave.leaveType}) was deleted by ${req.user.fullName}.`,
        data: { leaveId: leave._id }
      });
    } catch (notifyError) {
      console.error("Admin notification error (non-blocking):", notifyError);
    }

    res.json({
      success: true,
      data: {},
    });
  } catch (error) {
    console.error("Error in deleteLeave:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Approve leave
// @route   PUT /api/leaves/:id/approve
// @access  Private/Admin
exports.approveLeave = async (req, res) => {
  try {
    // Check authorization
    if (!["Admin", "HR", "Manager"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to approve leaves",
      });
    }

    const leave = await Leave.findById(req.params.id).populate("employeeId", "fullName");
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave not found",
      });
    }

    const oldLeave = leave.toObject();
    leave.status = "approved";
    leave.approvedBy = req.user.id;
    leave.approvedDate = Date.now();
    await leave.save();

    // Trigger Attendance Sync
    await syncLeaveToAttendance(leave, req.user.id);

    // Detailed Admin Notification
    const fieldLabels = {
      status: "Status",
      approvedBy: "Approved By",
      rejectedBy: "Rejected By",
      rejectionReason: "Rejection Reason"
    };

    const changes = trackChanges(oldLeave, leave.toObject(), fieldLabels);
    
    if (changes.length > 0) {
      const employeeName = leave.employeeId?.fullName || "Employee";
      await notifyAdmins({
        type: "LEAVE_UPDATED",
        message: `${req.user.fullName} updated leave for ${employeeName}. Changes: ${changes.join(", ")}`,
        leaveId: leave._id
      });
    }

    res.json({
      success: true,
      data: leave,
    });
  } catch (error) {
    console.error("Error in approveLeave:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Reject leave
// @route   PUT /api/leaves/:id/reject
// @access  Private/Admin
exports.rejectLeave = async (req, res) => {
  try {
    // Check authorization
    if (!["Admin", "HR", "Manager"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to reject leaves",
      });
    }

    const leave = await Leave.findById(req.params.id).populate("employeeId", "fullName");
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave not found",
      });
    }

    const oldLeave = leave.toObject();
    leave.status = "rejected";
    leave.rejectedBy = req.user.id;
    leave.rejectedDate = Date.now();
    leave.rejectionReason = req.body.reason;
    await leave.save();

    // Detailed Admin Notification
    const fieldLabels = {
      status: "Status",
      approvedBy: "Approved By",
      rejectedBy: "Rejected By",
      rejectionReason: "Rejection Reason"
    };

    const changes = trackChanges(oldLeave, leave.toObject(), fieldLabels);
    
    if (changes.length > 0) {
      const employeeName = leave.employeeId?.fullName || "Employee";
      await notifyAdmins({
        type: "LEAVE_UPDATED",
        message: `${req.user.fullName} updated leave for ${employeeName}. Changes: ${changes.join(", ")}`,
        leaveId: leave._id
      });
    }

    res.json({
      success: true,
      data: leave,
    });
  } catch (error) {
    console.error("Error in rejectLeave:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
