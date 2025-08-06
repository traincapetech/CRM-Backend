const Voucher = require('../models/Voucher');
const User = require('../models/User');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Create new voucher
// @route   POST /api/vouchers
// @access  Private
exports.createVoucher = asyncHandler(async (req, res, next) => {
  const {
    clientName,
    clientMobile,
    clientEmail,
    clientUsername,
    clientPassword,
    voucherNumber,
    voucherAmount,
    voucherCurrency,
    paymentDate,
    paymentMethod,
    courseName,
    courseDuration,
    description,
    notes,
    expiryDate,
    assignedTo
  } = req.body;

  // Create voucher
  const voucher = await Voucher.create({
    clientName,
    clientMobile,
    clientEmail,
    clientUsername,
    clientPassword,
    voucherNumber,
    voucherAmount,
    voucherCurrency,
    paymentDate,
    paymentMethod,
    courseName,
    courseDuration,
    description,
    notes,
    expiryDate,
    assignedTo: assignedTo || req.user.id
  });

  // Populate assigned user details
  await voucher.populate('assignedTo', 'fullName email role');

  res.status(201).json({
    success: true,
    data: voucher,
    message: 'Voucher created successfully'
  });
});

// @desc    Get all vouchers with filtering and pagination
// @route   GET /api/vouchers
// @access  Private
exports.getVouchers = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    status,
    paymentStatus,
    assignedTo,
    clientName,
    voucherNumber,
    startDate,
    endDate,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build filter object
  const filter = {};

  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (clientName) {
    filter.clientName = { $regex: clientName, $options: 'i' };
  }
  if (voucherNumber) {
    filter.voucherNumber = { $regex: voucherNumber, $options: 'i' };
  }

  // Date range filter
  if (startDate || endDate) {
    filter.paymentDate = {};
    if (startDate) filter.paymentDate.$gte = new Date(startDate);
    if (endDate) filter.paymentDate.$lte = new Date(endDate);
  }

  // Role-based filtering
  if (req.user.role === 'Sales Person') {
    filter.assignedTo = req.user.id;
  }

  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

  // Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Execute query
  const vouchers = await Voucher.find(filter)
    .populate('assignedTo', 'fullName email role')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  // Get total count for pagination
  const total = await Voucher.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: vouchers,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      totalItems: total,
      itemsPerPage: parseInt(limit)
    }
  });
});

// @desc    Get single voucher
// @route   GET /api/vouchers/:id
// @access  Private
exports.getVoucher = asyncHandler(async (req, res, next) => {
  const voucher = await Voucher.findById(req.params.id)
    .populate('assignedTo', 'fullName email role');

  if (!voucher) {
    return next(new ErrorResponse('Voucher not found', 404));
  }

  // Check if user has access to this voucher
  if (req.user.role === 'Sales Person' && voucher.assignedTo._id.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to access this voucher', 403));
  }

  res.status(200).json({
    success: true,
    data: voucher
  });
});

// @desc    Update voucher
// @route   PUT /api/vouchers/:id
// @access  Private
exports.updateVoucher = asyncHandler(async (req, res, next) => {
  let voucher = await Voucher.findById(req.params.id);

  if (!voucher) {
    return next(new ErrorResponse('Voucher not found', 404));
  }

  // Check if user has access to update this voucher
  if (req.user.role === 'Sales Person' && voucher.assignedTo.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this voucher', 403));
  }

  // Prevent updating voucher number
  delete req.body.voucherNumber;

  voucher = await Voucher.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  }).populate('assignedTo', 'fullName email role');

  res.status(200).json({
    success: true,
    data: voucher,
    message: 'Voucher updated successfully'
  });
});

// @desc    Delete voucher
// @route   DELETE /api/vouchers/:id
// @access  Private (Admin/Manager only)
exports.deleteVoucher = asyncHandler(async (req, res, next) => {
  const voucher = await Voucher.findById(req.params.id);

  if (!voucher) {
    return next(new ErrorResponse('Voucher not found', 404));
  }

  // Only Admin and Manager can delete vouchers
  if (!['Admin', 'Manager'].includes(req.user.role)) {
    return next(new ErrorResponse('Not authorized to delete vouchers', 403));
  }

  await voucher.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Voucher deleted successfully'
  });
});

// @desc    Update payment status
// @route   PATCH /api/vouchers/:id/payment-status
// @access  Private
exports.updatePaymentStatus = asyncHandler(async (req, res, next) => {
  const { paymentStatus, paymentDate, paymentMethod } = req.body;
  
  const voucher = await Voucher.findById(req.params.id);

  if (!voucher) {
    return next(new ErrorResponse('Voucher not found', 404));
  }

  // Check if user has access to update this voucher
  if (req.user.role === 'Sales Person' && voucher.assignedTo.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this voucher', 403));
  }

  // Update payment details
  const updateData = {};
  if (paymentStatus) updateData.paymentStatus = paymentStatus;
  if (paymentDate) updateData.paymentDate = new Date(paymentDate);
  if (paymentMethod) updateData.paymentMethod = paymentMethod;

  voucher = await Voucher.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true
  }).populate('assignedTo', 'fullName email role');

  res.status(200).json({
    success: true,
    data: voucher,
    message: 'Payment status updated successfully'
  });
});

// @desc    Mark voucher as used
// @route   PATCH /api/vouchers/:id/use
// @access  Private
exports.useVoucher = asyncHandler(async (req, res, next) => {
  const voucher = await Voucher.findById(req.params.id);

  if (!voucher) {
    return next(new ErrorResponse('Voucher not found', 404));
  }

  if (voucher.status === 'Used') {
    return next(new ErrorResponse('Voucher has already been used', 400));
  }

  if (voucher.status === 'Expired') {
    return next(new ErrorResponse('Voucher has expired', 400));
  }

  if (voucher.isExpired()) {
    voucher.status = 'Expired';
    await voucher.save();
    return next(new ErrorResponse('Voucher has expired', 400));
  }

  await voucher.markAsUsed();

  res.status(200).json({
    success: true,
    data: voucher,
    message: 'Voucher marked as used successfully'
  });
});

// @desc    Get voucher statistics
// @route   GET /api/vouchers/stats
// @access  Private
exports.getVoucherStats = asyncHandler(async (req, res, next) => {
  const { period = 'all' } = req.query;

  // Build date filter
  let dateFilter = {};
  if (period !== 'all') {
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }
    
    dateFilter = { createdAt: { $gte: startDate } };
  }

  // Role-based filtering
  if (req.user.role === 'Sales Person') {
    dateFilter.assignedTo = req.user.id;
  }

  // Get statistics
  const stats = await Voucher.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: null,
        totalVouchers: { $sum: 1 },
        totalAmount: { $sum: '$voucherAmount' },
        activeVouchers: {
          $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
        },
        usedVouchers: {
          $sum: { $cond: [{ $eq: ['$status', 'Used'] }, 1, 0] }
        },
        expiredVouchers: {
          $sum: { $cond: [{ $eq: ['$status', 'Expired'] }, 1, 0] }
        },
        pendingPayments: {
          $sum: { $cond: [{ $eq: ['$paymentStatus', 'Pending'] }, 1, 0] }
        },
        completedPayments: {
          $sum: { $cond: [{ $eq: ['$paymentStatus', 'Completed'] }, 1, 0] }
        }
      }
    }
  ]);

  // Get status breakdown
  const statusBreakdown = await Voucher.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$voucherAmount' }
      }
    }
  ]);

  // Get payment method breakdown
  const paymentMethodBreakdown = await Voucher.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        totalAmount: { $sum: '$voucherAmount' }
      }
    }
  ]);

  // Get currency breakdown
  const currencyBreakdown = await Voucher.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: '$voucherCurrency',
        count: { $sum: 1 },
        totalAmount: { $sum: '$voucherAmount' }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: {
      summary: stats[0] || {
        totalVouchers: 0,
        totalAmount: 0,
        activeVouchers: 0,
        usedVouchers: 0,
        expiredVouchers: 0,
        pendingPayments: 0,
        completedPayments: 0
      },
      statusBreakdown,
      paymentMethodBreakdown,
      currencyBreakdown
    }
  });
});

// @desc    Search vouchers
// @route   GET /api/vouchers/search
// @access  Private
exports.searchVouchers = asyncHandler(async (req, res, next) => {
  const { query, limit = 10 } = req.query;

  if (!query) {
    return next(new ErrorResponse('Search query is required', 400));
  }

  // Build search filter
  const searchFilter = {
    $or: [
      { clientName: { $regex: query, $options: 'i' } },
      { clientEmail: { $regex: query, $options: 'i' } },
      { clientMobile: { $regex: query, $options: 'i' } },
      { voucherNumber: { $regex: query, $options: 'i' } },
      { courseName: { $regex: query, $options: 'i' } }
    ]
  };

  // Role-based filtering
  if (req.user.role === 'Sales Person') {
    searchFilter.assignedTo = req.user.id;
  }

  const vouchers = await Voucher.find(searchFilter)
    .populate('assignedTo', 'fullName email role')
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: vouchers
  });
});

// @desc    Bulk create vouchers
// @route   POST /api/vouchers/bulk
// @access  Private (Admin/Manager only)
exports.bulkCreateVouchers = asyncHandler(async (req, res, next) => {
  const { vouchers } = req.body;

  if (!vouchers || !Array.isArray(vouchers) || vouchers.length === 0) {
    return next(new ErrorResponse('Vouchers array is required', 400));
  }

  // Only Admin and Manager can bulk create vouchers
  if (!['Admin', 'Manager'].includes(req.user.role)) {
    return next(new ErrorResponse('Not authorized to bulk create vouchers', 403));
  }

  const createdVouchers = [];
  const errors = [];

  for (let i = 0; i < vouchers.length; i++) {
    try {
      const voucherData = vouchers[i];
      const voucherNumber = await Voucher.generateVoucherNumber();
      
      const voucher = await Voucher.create({
        ...voucherData,
        voucherNumber,
        assignedTo: voucherData.assignedTo || req.user.id
      });

      await voucher.populate('assignedTo', 'fullName email role');
      createdVouchers.push(voucher);
    } catch (error) {
      errors.push({
        index: i,
        error: error.message,
        data: vouchers[i]
      });
    }
  }

  res.status(200).json({
    success: true,
    data: {
      created: createdVouchers,
      errors,
      summary: {
        total: vouchers.length,
        created: createdVouchers.length,
        failed: errors.length
      }
    }
  });
});

// @desc    Export vouchers to CSV
// @route   GET /api/vouchers/export
// @access  Private
exports.exportVouchers = asyncHandler(async (req, res, next) => {
  const { format = 'csv', status, startDate, endDate } = req.query;

  // Build filter
  const filter = {};
  if (status) filter.status = status;
  if (startDate || endDate) {
    filter.paymentDate = {};
    if (startDate) filter.paymentDate.$gte = new Date(startDate);
    if (endDate) filter.paymentDate.$lte = new Date(endDate);
  }

  // Role-based filtering
  if (req.user.role === 'Sales Person') {
    filter.assignedTo = req.user.id;
  }

  const vouchers = await Voucher.find(filter)
    .populate('assignedTo', 'fullName email role')
    .sort({ createdAt: -1 });

  if (format === 'csv') {
    // Generate CSV
    const csvHeader = 'Voucher Number,Client Name,Client Email,Client Mobile,Amount,Currency,Payment Date,Payment Method,Status,Course Name,Assigned To,Created Date\n';
    
    const csvRows = vouchers.map(voucher => {
      return [
        voucher.voucherNumber,
        voucher.clientName,
        voucher.clientEmail,
        voucher.clientMobile,
        voucher.voucherAmount,
        voucher.voucherCurrency,
        new Date(voucher.paymentDate).toLocaleDateString(),
        voucher.paymentMethod,
        voucher.status,
        voucher.courseName,
        voucher.assignedTo?.fullName || 'N/A',
        new Date(voucher.createdAt).toLocaleDateString()
      ].join(',');
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=vouchers.csv');
    res.send(csvContent);
  } else {
    res.status(200).json({
      success: true,
      data: vouchers
    });
  }
}); 