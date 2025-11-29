const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const User = require('../models/User');
const mongoose = require('mongoose');

// @desc    Get my leaves
// @route   GET /api/leaves/my-leaves
// @access  Private
exports.getMyLeaves = async (req, res) => {
  try {
    console.log('Getting leaves for user:', req.user.id);
    const employee = await Employee.findOne({ userId: req.user.id });
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }

    // Find leaves by both employeeId and userId
    const leaves = await Leave.find({
      $or: [
        { employeeId: employee._id },
        { userId: req.user.id }
      ]
    }).sort({ createdAt: -1 });

    console.log(`Found ${leaves.length} leaves for employee:`, employee._id);
    res.json({
      success: true,
      data: leaves
    });
  } catch (error) {
    console.error('Error in getMyLeaves:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get leave balance
// @route   GET /api/leaves/balance
// @access  Private
exports.getLeaveBalance = async (req, res) => {
  try {
    console.log('Getting leave balance for user:', req.user.id);
    const employee = await Employee.findOne({ userId: req.user.id });
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
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
        earned: 0
      }
    };

    // Calculate used leaves by both employeeId and userId
    const leaves = await Leave.find({
      $or: [
        { employeeId: employee._id },
        { userId: req.user.id }
      ],
      status: 'approved',
      startDate: {
        $gte: new Date(new Date().getFullYear(), 0, 1),
        $lte: new Date(new Date().getFullYear(), 11, 31)
      }
    });

    console.log(`Found ${leaves.length} approved leaves for balance calculation`);
    leaves.forEach(leave => {
      if (leave.leaveType in leaveBalance.used) {
        leaveBalance.used[leave.leaveType] += leave.totalDays;
      }
    });

    // Calculate remaining balance
    const balance = {
      casual: leaveBalance.casual - leaveBalance.used.casual,
      sick: leaveBalance.sick - leaveBalance.used.sick,
      earned: leaveBalance.earned - leaveBalance.used.earned
    };

    console.log('Leave balance calculated:', balance);
    res.json({
      success: true,
      data: {
        total: leaveBalance,
        used: leaveBalance.used,
        remaining: balance
      }
    });
  } catch (error) {
    console.error('Error in getLeaveBalance:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get all leaves (admin/manager)
// @route   GET /api/leaves
// @access  Private/Admin
exports.getLeaves = async (req, res) => {
  try {
    const leaves = await Leave.find()
      .populate('employeeId', 'fullName email department')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: leaves
    });
  } catch (error) {
    console.error('Error in getLeaves:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create leave
// @route   POST /api/leaves
// @access  Private
exports.createLeave = async (req, res) => {
  try {
    console.log('Creating leave - Request body:', req.body);
    console.log('User:', { id: req.user.id, role: req.user.role, email: req.user.email });
    
    const employee = await Employee.findOne({ userId: req.user.id });
    console.log('Found employee:', employee ? employee._id : 'Not found');
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
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

    console.log('Dates:', { start, end, today, startOfDay });

    // Allow today and future dates
    if (startOfDay < today) {
      return res.status(400).json({
        success: false,
        message: 'Start date cannot be in the past'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
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
      status: 'pending'
    };

    console.log('Creating leave with data:', leaveData);

    const leave = await Leave.create(leaveData);
    console.log('Leave created:', leave._id);

    res.status(201).json({
      success: true,
      data: leave
    });
  } catch (error) {
    console.error('Error in createLeave:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
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
        message: 'Leave not found'
      });
    }

    // Only allow update if status is PENDING
    if (leave.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update processed leave application'
      });
    }

    const updatedLeave = await Leave.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: updatedLeave
    });
  } catch (error) {
    console.error('Error in updateLeave:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete leave
// @route   DELETE /api/leaves/:id
// @access  Private
exports.deleteLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave not found'
      });
    }

    // Only allow deletion if status is PENDING
    if (leave.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete processed leave application'
      });
    }

    await leave.remove();

    res.json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Error in deleteLeave:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Approve leave
// @route   PUT /api/leaves/:id/approve
// @access  Private/Admin
exports.approveLeave = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to approve leaves'
      });
    }

    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave not found'
      });
    }

    leave.status = 'approved';
    leave.approvedBy = req.user.id;
    leave.approvedDate = Date.now();
    await leave.save();

    res.json({
      success: true,
      data: leave
    });
  } catch (error) {
    console.error('Error in approveLeave:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Reject leave
// @route   PUT /api/leaves/:id/reject
// @access  Private/Admin
exports.rejectLeave = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reject leaves'
      });
    }

    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave not found'
      });
    }

    leave.status = 'rejected';
    leave.rejectedBy = req.user.id;
    leave.rejectedDate = Date.now();
    leave.rejectionReason = req.body.reason;
    await leave.save();

    res.json({
      success: true,
      data: leave
    });
  } catch (error) {
    console.error('Error in rejectLeave:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
}; 