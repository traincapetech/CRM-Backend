const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const User = require('../models/User');
const mongoose = require('mongoose');

// @desc    Apply for leave
// @route   POST /api/leaves
// @access  Private
exports.applyLeave = async (req, res) => {
  try {
    console.log('=== LEAVE APPLICATION REQUEST ===');
    console.log('User:', { id: req.user.id, role: req.user.role, fullName: req.user.fullName });
    console.log('Request body:', req.body);
    
    const { leaveType, startDate, endDate, reason, isHalfDay, halfDaySession } = req.body;
    
    // Validate required fields
    if (!leaveType || !startDate || !endDate || !reason) {
      console.log('Missing required fields:', { leaveType, startDate, endDate, reason });
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }
    
    // Find employee record
    console.log('Looking for employee record with userId:', req.user.id);
    let employee = await Employee.findOne({ userId: req.user.id });
    console.log('Employee found:', employee ? 'Yes' : 'No');
    
    if (!employee) {
      console.log('No employee record found, attempting to create one...');
      
      // Try to create a basic employee record for the user
      try {
        const Department = require('../models/Department');
        const Role = require('../models/EmployeeRole');
        
        // Find or create a default department
        let department = await Department.findOne({ name: 'General' });
        if (!department) {
          department = await Department.create({
            name: 'General',
            description: 'General Department'
          });
        }
        
        // Find or create a default role
        let role = await Role.findOne({ name: req.user.role });
        if (!role) {
          role = await Role.create({
            name: req.user.role || 'Employee',
            description: `Role for ${req.user.role || 'Employee'}`
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
        employee = newEmployee;
        
      } catch (createError) {
        console.error('Error creating employee record:', createError);
        return res.status(400).json({
          success: false,
          message: 'Unable to create employee record. Please contact HR.'
        });
      }
    }
    
    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('Date validation:', { start, end, today });
    
    if (start < today) {
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
    
    // Check for overlapping leaves
    console.log('Checking for overlapping leaves...');
    const overlappingLeave = await Leave.findOne({
      employeeId: employee._id,
      status: { $in: ['pending', 'approved'] },
      $or: [
        { startDate: { $lte: end }, endDate: { $gte: start } }
      ]
    });
    
    if (overlappingLeave) {
      console.log('Found overlapping leave:', overlappingLeave._id);
      return res.status(400).json({
        success: false,
        message: 'You already have a leave application for overlapping dates'
      });
    }
    
    // Create leave application
    console.log('Creating leave application...');
    
    // Calculate total days manually
    let totalDays;
    if (isHalfDay) {
      totalDays = 0.5;
    } else {
      const timeDiff = end.getTime() - start.getTime();
      totalDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
    }
    
    const leaveData = {
      employeeId: employee._id,
      userId: req.user.id,
      leaveType,
      startDate: start,
      endDate: end,
      totalDays: totalDays,
      reason,
      isHalfDay: isHalfDay || false,
      halfDaySession: (isHalfDay && halfDaySession) ? halfDaySession : undefined
    };
    
    console.log('Leave data to create:', leaveData);
    const leave = await Leave.create(leaveData);
    console.log('Leave created successfully:', leave._id);
    
    // Populate employee and user details
    const populatedLeave = await Leave.findById(leave._id)
      .populate('employeeId', 'fullName email department role')
      .populate('userId', 'fullName email');
    
    console.log('=== LEAVE APPLICATION SUCCESS ===');
    res.status(201).json({
      success: true,
      data: populatedLeave,
      message: 'Leave application submitted successfully'
    });
    
  } catch (error) {
    console.error('=== LEAVE APPLICATION ERROR ===');
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Server error while applying leave',
      error: error.message
    });
  }
};

// @desc    Get all leaves (for managers/admins)
// @route   GET /api/leaves
// @access  Private (Manager/Admin)
exports.getAllLeaves = async (req, res) => {
  try {
    const { status, leaveType, startDate, endDate, page = 1, limit = 10 } = req.query;
    
    // Build query
    const query = {};
    
    if (status) query.status = status;
    if (leaveType) query.leaveType = leaveType;
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.startDate.$lte = new Date(endDate);
    }
    
    const skip = (page - 1) * limit;
    
    const leaves = await Leave.find(query)
      .populate('employeeId', 'fullName email department role')
      .populate('userId', 'fullName email')
      .populate('approvedBy', 'fullName email')
      .sort({ appliedDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Leave.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: leaves,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error getting leaves:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching leaves'
    });
  }
};

// @desc    Get my leaves
// @route   GET /api/leaves/my-leaves
// @access  Private
exports.getMyLeaves = async (req, res) => {
  try {
    const { status, year, page = 1, limit = 10 } = req.query;
    
    // Find employee record
    const employee = await Employee.findOne({ userId: req.user.id });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }
    
    // Build query
    const query = { employeeId: employee._id };
    
    if (status) query.status = status;
    if (year) {
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31);
      query.startDate = { $gte: startOfYear, $lte: endOfYear };
    }
    
    const skip = (page - 1) * limit;
    
    const leaves = await Leave.find(query)
      .populate('approvedBy', 'fullName email')
      .sort({ appliedDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Leave.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: leaves,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error getting my leaves:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching your leaves'
    });
  }
};

// @desc    Approve/Reject leave
// @route   PUT /api/leaves/:id/status
// @access  Private (Manager/Admin)
exports.updateLeaveStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be approved or rejected'
      });
    }
    
    if (status === 'rejected' && !rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required when rejecting leave'
      });
    }
    
    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave application not found'
      });
    }
    
    if (leave.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Leave application has already been processed'
      });
    }
    
    // Update leave status
    leave.status = status;
    leave.approvedBy = req.user.id;
    leave.approvedDate = new Date();
    
    if (status === 'rejected') {
      leave.rejectionReason = rejectionReason;
    }
    
    await leave.save();
    
    // Populate for response
    const populatedLeave = await Leave.findById(leave._id)
      .populate('employeeId', 'fullName email department role')
      .populate('userId', 'fullName email')
      .populate('approvedBy', 'fullName email');
    
    res.status(200).json({
      success: true,
      data: populatedLeave,
      message: `Leave ${status} successfully`
    });
    
  } catch (error) {
    console.error('Error updating leave status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating leave status'
    });
  }
};

// @desc    Cancel leave
// @route   PUT /api/leaves/:id/cancel
// @access  Private
exports.cancelLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave application not found'
      });
    }
    
    // Check if user owns this leave
    if (leave.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own leaves'
      });
    }
    
    if (leave.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'You can only cancel pending leave applications'
      });
    }
    
    leave.status = 'cancelled';
    await leave.save();
    
    res.status(200).json({
      success: true,
      data: leave,
      message: 'Leave cancelled successfully'
    });
    
  } catch (error) {
    console.error('Error cancelling leave:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling leave'
    });
  }
};

// @desc    Get leave statistics
// @route   GET /api/leaves/stats
// @access  Private
exports.getLeaveStats = async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    
    let matchQuery = {};
    
    // If not admin/manager, only show own stats
    if (!['Admin', 'Manager'].includes(req.user.role)) {
      const employee = await Employee.findOne({ userId: req.user.id });
      if (employee) {
        matchQuery.employeeId = employee._id;
      }
    }
    
    // Add year filter
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31);
    matchQuery.startDate = { $gte: startOfYear, $lte: endOfYear };
    
    const stats = await Leave.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalDays: { $sum: '$totalDays' }
        }
      }
    ]);
    
    const leaveTypeStats = await Leave.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$leaveType',
          count: { $sum: 1 },
          totalDays: { $sum: '$totalDays' }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        statusStats: stats,
        leaveTypeStats: leaveTypeStats
      }
    });
    
  } catch (error) {
    console.error('Error getting leave stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching leave statistics'
    });
  }
};

// @desc    Get leave balance
// @route   GET /api/leaves/balance
// @access  Private
exports.getLeaveBalance = async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    
    const employee = await Employee.findOne({ userId: req.user.id });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }
    
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31);
    
    // Get used leaves
    const usedLeaves = await Leave.aggregate([
      {
        $match: {
          employeeId: employee._id,
          status: 'approved',
          startDate: { $gte: startOfYear, $lte: endOfYear }
        }
      },
      {
        $group: {
          _id: '$leaveType',
          totalDays: { $sum: '$totalDays' }
        }
      }
    ]);
    
    // Default leave balances (these should be configurable)
    const defaultBalances = {
      annual: 21,
      sick: 10,
      casual: 12,
      emergency: 5,
      personal: 3
    };
    
    const balances = {};
    Object.keys(defaultBalances).forEach(type => {
      const used = usedLeaves.find(leave => leave._id === type);
      balances[type] = {
        total: defaultBalances[type],
        used: used ? used.totalDays : 0,
        remaining: defaultBalances[type] - (used ? used.totalDays : 0)
      };
    });
    
    res.status(200).json({
      success: true,
      data: balances
    });
    
  } catch (error) {
    console.error('Error getting leave balance:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching leave balance'
    });
  }
}; 