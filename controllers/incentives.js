const Incentive = require('../models/Incentive');
const Employee = require('../models/Employee');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { UPLOAD_PATHS } = require('../config/storage');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_PATHS.INCENTIVES);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'incentive-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Allow documents and images
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, and image files are allowed!'), false);
    }
  }
});

// @desc    Create new incentive
// @route   POST /api/incentives
// @access  Private (Admin/HR/Manager)
exports.createIncentive = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create incentives'
      });
    }

    const {
      employeeId, type, title, description, amount,
      performanceRating, performancePeriod, projectName,
      projectCompletionDate, attendancePercentage, attendancePeriod,
      festivalType, validFrom, validTo, isRecurring, recurringType
    } = req.body;

    // Validate required fields
    if (!employeeId || !type || !title || !description || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, type, title, description, and amount are required'
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

    // Prepare incentive data
    const incentiveData = {
      employeeId,
      userId: employee.userId,
      type,
      title,
      description,
      amount: parseFloat(amount),
      requestedBy: req.user.id
    };

    // Add type-specific fields
    if (type === 'PERFORMANCE') {
      incentiveData.performanceRating = performanceRating;
      if (performancePeriod) {
        incentiveData.performancePeriod = JSON.parse(performancePeriod);
      }
    }

    if (type === 'PROJECT') {
      incentiveData.projectName = projectName;
      if (projectCompletionDate) {
        incentiveData.projectCompletionDate = new Date(projectCompletionDate);
      }
    }

    if (type === 'ATTENDANCE') {
      incentiveData.attendancePercentage = attendancePercentage;
      if (attendancePeriod) {
        incentiveData.attendancePeriod = JSON.parse(attendancePeriod);
      }
    }

    if (type === 'FESTIVAL') {
      incentiveData.festivalType = festivalType;
    }

    // Add validity period
    if (validFrom) incentiveData.validFrom = new Date(validFrom);
    if (validTo) incentiveData.validTo = new Date(validTo);

    // Add recurring info
    if (isRecurring === 'true') {
      incentiveData.isRecurring = true;
      incentiveData.recurringType = recurringType;
    }

    // Handle file attachments
    if (req.files && req.files.length > 0) {
      incentiveData.attachments = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size,
        uploadedBy: req.user.id
      }));
    }

    // Create incentive
    const incentive = await Incentive.create(incentiveData);

    // Populate the created incentive
    const populatedIncentive = await Incentive.findById(incentive._id)
      .populate('employeeId', 'fullName email department')
      .populate('userId', 'fullName email')
      .populate('requestedBy', 'fullName email');

    res.status(201).json({
      success: true,
      data: populatedIncentive,
      message: 'Incentive created successfully'
    });
  } catch (error) {
    console.error('Create incentive error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during incentive creation'
    });
  }
};

// @desc    Get incentives
// @route   GET /api/incentives
// @access  Private
exports.getIncentives = async (req, res) => {
  try {
    const { employeeId, type, status, page = 1, limit = 20 } = req.query;

    // Build query based on user role
    let query = {};

    if (req.user.role === 'Employee') {
      // Employees can only see their own incentives
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
        message: 'Not authorized to view incentives'
      });
    }

    // Add filters
    if (type) query.type = type;
    if (status) query.status = status;

    // Get incentives with pagination
    const skip = (page - 1) * limit;
    const incentives = await Incentive.find(query)
      .populate('employeeId', 'fullName email department')
      .populate('userId', 'fullName email')
      .populate('requestedBy', 'fullName email')
      .populate('approvedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Incentive.countDocuments(query);

    res.status(200).json({
      success: true,
      data: incentives,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get incentives error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single incentive
// @route   GET /api/incentives/:id
// @access  Private
exports.getIncentive = async (req, res) => {
  try {
    const incentive = await Incentive.findById(req.params.id)
      .populate('employeeId', 'fullName email department')
      .populate('userId', 'fullName email')
      .populate('requestedBy', 'fullName email')
      .populate('approvedBy', 'fullName email')
      .populate('comments.commentBy', 'fullName email');

    if (!incentive) {
      return res.status(404).json({
        success: false,
        message: 'Incentive not found'
      });
    }

    // Check authorization
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({ userId: req.user.id });
      if (!employee || employee._id.toString() !== incentive.employeeId._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this incentive'
        });
      }
    } else if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view incentive'
      });
    }

    res.status(200).json({
      success: true,
      data: incentive
    });
  } catch (error) {
    console.error('Get incentive error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update incentive
// @route   PUT /api/incentives/:id
// @access  Private (Admin/HR/Manager)
exports.updateIncentive = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update incentives'
      });
    }

    const incentive = await Incentive.findById(req.params.id);
    if (!incentive) {
      return res.status(404).json({
        success: false,
        message: 'Incentive not found'
      });
    }

    // Update allowed fields
    const allowedFields = [
      'title', 'description', 'amount', 'performanceRating',
      'performancePeriod', 'projectName', 'projectCompletionDate',
      'attendancePercentage', 'attendancePeriod', 'festivalType',
      'validFrom', 'validTo', 'isRecurring', 'recurringType'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'amount') {
          incentive[field] = parseFloat(req.body[field]);
        } else if (field === 'performancePeriod' || field === 'attendancePeriod') {
          incentive[field] = JSON.parse(req.body[field]);
        } else if (field === 'validFrom' || field === 'validTo' || field === 'projectCompletionDate') {
          incentive[field] = new Date(req.body[field]);
        } else if (field === 'isRecurring') {
          incentive[field] = req.body[field] === 'true';
        } else {
          incentive[field] = req.body[field];
        }
      }
    });

    await incentive.save();

    const updatedIncentive = await Incentive.findById(incentive._id)
      .populate('employeeId', 'fullName email department')
      .populate('userId', 'fullName email')
      .populate('requestedBy', 'fullName email')
      .populate('approvedBy', 'fullName email');

    res.status(200).json({
      success: true,
      data: updatedIncentive,
      message: 'Incentive updated successfully'
    });
  } catch (error) {
    console.error('Update incentive error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Approve incentive
// @route   PUT /api/incentives/:id/approve
// @access  Private (Admin/HR/Manager)
exports.approveIncentive = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to approve incentives'
      });
    }

    const incentive = await Incentive.findById(req.params.id);
    if (!incentive) {
      return res.status(404).json({
        success: false,
        message: 'Incentive not found'
      });
    }

    incentive.status = 'APPROVED';
    incentive.approvedBy = req.user.id;
    incentive.approvedDate = new Date();

    await incentive.save();

    const updatedIncentive = await Incentive.findById(incentive._id)
      .populate('employeeId', 'fullName email department')
      .populate('userId', 'fullName email')
      .populate('requestedBy', 'fullName email')
      .populate('approvedBy', 'fullName email');

    res.status(200).json({
      success: true,
      data: updatedIncentive,
      message: 'Incentive approved successfully'
    });
  } catch (error) {
    console.error('Approve incentive error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Reject incentive
// @route   PUT /api/incentives/:id/reject
// @access  Private (Admin/HR/Manager)
exports.rejectIncentive = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reject incentives'
      });
    }

    const { reason } = req.body;

    const incentive = await Incentive.findById(req.params.id);
    if (!incentive) {
      return res.status(404).json({
        success: false,
        message: 'Incentive not found'
      });
    }

    incentive.status = 'REJECTED';
    incentive.rejectedReason = reason;
    incentive.approvedBy = req.user.id;
    incentive.approvedDate = new Date();

    await incentive.save();

    const updatedIncentive = await Incentive.findById(incentive._id)
      .populate('employeeId', 'fullName email department')
      .populate('userId', 'fullName email')
      .populate('requestedBy', 'fullName email')
      .populate('approvedBy', 'fullName email');

    res.status(200).json({
      success: true,
      data: updatedIncentive,
      message: 'Incentive rejected successfully'
    });
  } catch (error) {
    console.error('Reject incentive error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Add comment to incentive
// @route   POST /api/incentives/:id/comments
// @access  Private
exports.addComment = async (req, res) => {
  try {
    const { comment } = req.body;

    if (!comment) {
      return res.status(400).json({
        success: false,
        message: 'Comment is required'
      });
    }

    const incentive = await Incentive.findById(req.params.id);
    if (!incentive) {
      return res.status(404).json({
        success: false,
        message: 'Incentive not found'
      });
    }

    // Check authorization
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({ userId: req.user.id });
      if (!employee || employee._id.toString() !== incentive.employeeId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to comment on this incentive'
        });
      }
    } else if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add comments'
      });
    }

    incentive.addComment(req.user.id, comment);
    await incentive.save();

    const updatedIncentive = await Incentive.findById(incentive._id)
      .populate('employeeId', 'fullName email department')
      .populate('userId', 'fullName email')
      .populate('requestedBy', 'fullName email')
      .populate('approvedBy', 'fullName email')
      .populate('comments.commentBy', 'fullName email');

    res.status(200).json({
      success: true,
      data: updatedIncentive,
      message: 'Comment added successfully'
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete incentive
// @route   DELETE /api/incentives/:id
// @access  Private (Admin/HR/Manager)
exports.deleteIncentive = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete incentives'
      });
    }

    const incentive = await Incentive.findById(req.params.id);
    if (!incentive) {
      return res.status(404).json({
        success: false,
        message: 'Incentive not found'
      });
    }

    // Delete associated files
    if (incentive.attachments && incentive.attachments.length > 0) {
      incentive.attachments.forEach(attachment => {
        if (fs.existsSync(attachment.path)) {
          fs.unlinkSync(attachment.path);
        }
      });
    }

    await Incentive.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Incentive deleted successfully'
    });
  } catch (error) {
    console.error('Delete incentive error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get incentive statistics
// @route   GET /api/incentives/stats
// @access  Private (Admin/HR/Manager)
exports.getIncentiveStats = async (req, res) => {
  try {
    // Check authorization
    if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view incentive statistics'
      });
    }

    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();

    // Get statistics
    const stats = await Incentive.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(`${currentYear}-01-01`),
            $lte: new Date(`${currentYear}-12-31`)
          }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          approved: {
            $sum: {
              $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0]
            }
          },
          pending: {
            $sum: {
              $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0]
            }
          },
          rejected: {
            $sum: {
              $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Get monthly breakdown
    const monthlyStats = await Incentive.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(`${currentYear}-01-01`),
            $lte: new Date(`${currentYear}-12-31`)
          }
        }
      },
      {
        $group: {
          _id: { $month: '$createdAt' },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        byType: stats,
        byMonth: monthlyStats,
        year: currentYear
      }
    });
  } catch (error) {
    console.error('Get incentive stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Export multer upload middleware
exports.uploadIncentiveFiles = upload.array('attachments', 5); 