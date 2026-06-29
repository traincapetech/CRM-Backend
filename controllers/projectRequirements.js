const ProjectRequirement = require('../models/ProjectRequirement');
const Lead = require('../models/Lead');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const { sendEmail } = require('../config/nodemailer');
const notificationService = require('../services/notificationService');
const { uploadFile } = require('../services/fileStorageService');
const mongoose = require('mongoose');

// @desc    Get all project requirements with filters, search, pagination, sorting
// @route   GET /api/project-requests
// @access  Private (Admin, Manager, Sales Person, Lead Person)
exports.getRequirements = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const startIndex = (page - 1) * limit;

  let query = { currentStatus: { $ne: 'Archived' } };

  // Role permissions: Sales Persons and Lead Persons only see assigned requirements (unless Admin/Manager)
  if (req.user.role === 'Sales Person' || req.user.role === 'Lead Person') {
    query.$or = [
      { assignedSalesPerson: req.user._id },
      { assignedProjectManager: req.user._id }
    ];
  }

  // Filter: Status
  if (req.query.status) {
    query.currentStatus = req.query.status;
  }
  // Filter: Priority
  if (req.query.priority) {
    query.priority = req.query.priority;
  }
  // Filter: Source
  if (req.query.source) {
    query.source = req.query.source;
  }
  // Filter: Selected Service
  if (req.query.service) {
    query.selectedService = req.query.service;
  }
  // Filter: Date range
  if (req.query.startDate && req.query.endDate) {
    query.createdAt = {
      $gte: new Date(req.query.startDate),
      $lte: new Date(req.query.endDate)
    };
  }

  // Search: customerDetails name/email, companyDetails name
  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search, 'i');
    query.$and = query.$and || [];
    query.$and.push({
      $or: [
        { 'customerDetails.name': searchRegex },
        { 'customerDetails.email': searchRegex },
        { 'companyDetails.name': searchRegex },
        { requirementNumber: searchRegex }
      ]
    });
  }

  // Sort
  let sortBy = { createdAt: -1 };
  if (req.query.sort) {
    const parts = req.query.sort.split(':');
    sortBy = { [parts[0]]: parts[1] === 'desc' ? -1 : 1 };
  }

  const total = await ProjectRequirement.countDocuments(query);
  const requirements = await ProjectRequirement.find(query)
    .populate('assignedSalesPerson', 'fullName email role')
    .populate('assignedProjectManager', 'fullName email role')
    .populate('leadReference', 'name status')
    .sort(sortBy)
    .skip(startIndex)
    .limit(limit);

  res.status(200).json({
    success: true,
    count: requirements.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    data: requirements
  });
});

// @desc    Get single project requirement details
// @route   GET /api/project-requests/:id
// @access  Private (Admin, Manager, Sales Person, Lead Person)
exports.getRequirement = asyncHandler(async (req, res, next) => {
  const requirement = await ProjectRequirement.findById(req.params.id)
    .populate('assignedSalesPerson', 'fullName email role')
    .populate('assignedProjectManager', 'fullName email role')
    .populate('comments.author', 'fullName email profilePicture')
    .populate('activityLog.performedBy', 'fullName role')
    .populate('leadReference');

  if (!requirement) {
    return next(new ErrorResponse(`Project requirement not found with ID of ${req.params.id}`, 404));
  }

  // Access check
  if (
    (req.user.role === 'Sales Person' || req.user.role === 'Lead Person') &&
    requirement.assignedSalesPerson?.toString() !== req.user._id.toString() &&
    requirement.assignedProjectManager?.toString() !== req.user._id.toString()
  ) {
    return next(new ErrorResponse('Not authorized to access this project requirement', 403));
  }

  res.status(200).json({
    success: true,
    data: requirement
  });
});

// @desc    Create manual project requirement in CRM
// @route   POST /api/project-requests
// @access  Private (Admin, Manager, Sales Person, Lead Person)
exports.createRequirement = asyncHandler(async (req, res, next) => {
  req.body.requirementNumber = await ProjectRequirement.generateRequirementNumber();
  
  // Set default activity log
  req.body.activityLog = [
    {
      action: 'REQUIREMENT_CREATE',
      performedBy: req.user._id,
      details: 'Requirement manually created in CRM'
    }
  ];

  const requirement = await ProjectRequirement.create(req.body);

  res.status(201).json({
    success: true,
    data: requirement
  });
});

// @desc    Update project requirement
// @route   PUT /api/project-requests/:id
// @access  Private (Admin, Manager, Sales Person, Lead Person)
exports.updateRequirement = asyncHandler(async (req, res, next) => {
  let requirement = await ProjectRequirement.findById(req.params.id);

  if (!requirement) {
    return next(new ErrorResponse(`Project requirement not found with ID of ${req.params.id}`, 404));
  }

  // Access check
  if (
    (req.user.role === 'Sales Person' || req.user.role === 'Lead Person') &&
    requirement.assignedSalesPerson?.toString() !== req.user._id.toString() &&
    requirement.assignedProjectManager?.toString() !== req.user._id.toString()
  ) {
    return next(new ErrorResponse('Not authorized to update this project requirement', 403));
  }

  // Track status changes or assignment changes for internal activityLog
  const originalStatus = requirement.currentStatus;
  const originalSalesPerson = requirement.assignedSalesPerson;
  const originalProjectManager = requirement.assignedProjectManager;

  // Perform updates
  requirement = await ProjectRequirement.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  const logs = [];

  if (originalStatus !== requirement.currentStatus) {
    logs.push({
      action: 'STATUS_UPDATE',
      performedBy: req.user._id,
      details: `Status changed from "${originalStatus}" to "${requirement.currentStatus}"`
    });
  }

  if (String(originalSalesPerson) !== String(requirement.assignedSalesPerson)) {
    const assignedUser = requirement.assignedSalesPerson 
      ? await User.findById(requirement.assignedSalesPerson) 
      : null;
    
    logs.push({
      action: 'ASSIGNMENT_UPDATE',
      performedBy: req.user._id,
      details: assignedUser 
        ? `Sales Person assigned: ${assignedUser.fullName}`
        : 'Sales Person assignment removed'
    });

    // Notify assigned sales person
    if (assignedUser) {
      try {
        await notificationService.createNotification({
          recipient: assignedUser._id,
          type: 'PROJECT_REQUIREMENT_ASSIGNED',
          message: `You have been assigned to Project Requirement ${requirement.requirementNumber}.`
        });
        
        await sendEmail(
          assignedUser.email,
          `Assigned to Project Requirement ${requirement.requirementNumber}`,
          null,
          `<p>You have been assigned to Project Requirement <strong>${requirement.requirementNumber}</strong>. Please check your CRM dashboard.</p>`
        );
      } catch (err) {
        console.error('Notification error on assignment:', err.message);
      }
    }
  }

  if (String(originalProjectManager) !== String(requirement.assignedProjectManager)) {
    const assignedPM = requirement.assignedProjectManager 
      ? await User.findById(requirement.assignedProjectManager) 
      : null;
    
    logs.push({
      action: 'ASSIGNMENT_UPDATE',
      performedBy: req.user._id,
      details: assignedPM 
        ? `Project Manager assigned: ${assignedPM.fullName}`
        : 'Project Manager assignment removed'
    });

    // Notify PM
    if (assignedPM) {
      try {
        await notificationService.createNotification({
          recipient: assignedPM._id,
          type: 'PROJECT_REQUIREMENT_ASSIGNED',
          message: `You have been assigned as Project Manager for Requirement ${requirement.requirementNumber}.`
        });
        
        await sendEmail(
          assignedPM.email,
          `Assigned to Project Requirement ${requirement.requirementNumber}`,
          null,
          `<p>You have been assigned as Project Manager for Requirement <strong>${requirement.requirementNumber}</strong>. Please check your CRM dashboard.</p>`
        );
      } catch (err) {
        console.error('Notification error on assignment:', err.message);
      }
    }
  }

  if (logs.length > 0) {
    await ProjectRequirement.findByIdAndUpdate(req.params.id, {
      $push: { activityLog: { $each: logs } }
    });
    // Fetch refreshed requirement with comments/activityLog populated
    requirement = await ProjectRequirement.findById(req.params.id)
      .populate('assignedSalesPerson', 'fullName email role')
      .populate('assignedProjectManager', 'fullName email role')
      .populate('leadReference');
  }

  res.status(200).json({
    success: true,
    data: requirement
  });
});

// @desc    Soft delete / archive project requirement
// @route   DELETE /api/project-requests/:id
// @access  Private (Admin, Manager)
exports.deleteRequirement = asyncHandler(async (req, res, next) => {
  const requirement = await ProjectRequirement.findById(req.params.id);

  if (!requirement) {
    return next(new ErrorResponse(`Project requirement not found with ID of ${req.params.id}`, 404));
  }

  requirement.currentStatus = 'Archived';
  await requirement.save();

  // Log in activityLog
  await ProjectRequirement.findByIdAndUpdate(req.params.id, {
    $push: {
      activityLog: {
        action: 'REQUIREMENT_ARCHIVED',
        performedBy: req.user._id,
        details: 'Requirement archived (soft-deleted)'
      }
    }
  });

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Add comment to project requirement
// @route   POST /api/project-requests/:id/comments
// @access  Private (Admin, Manager, Sales Person, Lead Person)
exports.addComment = asyncHandler(async (req, res, next) => {
  const { body } = req.body;
  if (!body) {
    return next(new ErrorResponse('Please provide comment body', 400));
  }

  let requirement = await ProjectRequirement.findById(req.params.id);
  if (!requirement) {
    return next(new ErrorResponse(`Project requirement not found with ID of ${req.params.id}`, 404));
  }

  // Access check
  if (
    (req.user.role === 'Sales Person' || req.user.role === 'Lead Person') &&
    requirement.assignedSalesPerson?.toString() !== req.user._id.toString() &&
    requirement.assignedProjectManager?.toString() !== req.user._id.toString()
  ) {
    return next(new ErrorResponse('Not authorized to comment on this requirement', 403));
  }

  requirement = await ProjectRequirement.findByIdAndUpdate(
    req.params.id,
    {
      $push: {
        comments: {
          body,
          author: req.user._id,
          createdAt: new Date()
        },
        activityLog: {
          action: 'COMMENT_ADD',
          performedBy: req.user._id,
          details: 'New comment added'
        }
      }
    },
    { new: true }
  ).populate('comments.author', 'fullName email profilePicture')
   .populate('assignedSalesPerson', 'fullName email role')
   .populate('assignedProjectManager', 'fullName email role');

  res.status(200).json({
    success: true,
    data: requirement
  });
});

// @desc    Upload attachments to Cloudflare R2 and save in requirement
// @route   POST /api/project-requests/:id/attachments
// @access  Private (Admin, Manager, Sales Person, Lead Person)
exports.uploadAttachment = asyncHandler(async (req, res, next) => {
  let requirement = await ProjectRequirement.findById(req.params.id);
  if (!requirement) {
    return next(new ErrorResponse(`Project requirement not found with ID of ${req.params.id}`, 404));
  }

  if (!req.file) {
    return next(new ErrorResponse('Please upload a file', 400));
  }

  // Access check
  if (
    (req.user.role === 'Sales Person' || req.user.role === 'Lead Person') &&
    requirement.assignedSalesPerson?.toString() !== req.user._id.toString() &&
    requirement.assignedProjectManager?.toString() !== req.user._id.toString()
  ) {
    return next(new ErrorResponse('Not authorized to add attachments to this requirement', 403));
  }

  // Upload to R2 (or local fallback)
  const result = await uploadFile(req.file, 'requirements');

  const attachmentData = {
    fileName: req.file.originalname,
    url: result.url,
    key: result.key || '',
    size: req.file.size,
    mimetype: req.file.mimetype,
    uploadedAt: new Date()
  };

  requirement = await ProjectRequirement.findByIdAndUpdate(
    req.params.id,
    {
      $push: {
        attachments: attachmentData,
        activityLog: {
          action: 'ATTACHMENT_UPLOAD',
          performedBy: req.user._id,
          details: `Uploaded file: ${req.file.originalname}`
        }
      }
    },
    { new: true }
  ).populate('comments.author', 'fullName email profilePicture')
   .populate('assignedSalesPerson', 'fullName email role')
   .populate('assignedProjectManager', 'fullName email role');

  res.status(200).json({
    success: true,
    data: requirement
  });
});

// @desc    Convert project requirement into a Lead
// @route   POST /api/project-requests/:id/convert-lead
// @access  Private (Admin, Manager, Sales Person, Lead Person)
exports.convertToLead = asyncHandler(async (req, res, next) => {
  let requirement = await ProjectRequirement.findById(req.params.id);
  if (!requirement) {
    return next(new ErrorResponse(`Project requirement not found with ID of ${req.params.id}`, 404));
  }

  if (requirement.leadReference) {
    return next(new ErrorResponse('Requirement has already been converted into a Lead', 400));
  }

  // Create new Lead document
  const leadData = {
    name: requirement.customerDetails.name,
    email: requirement.customerDetails.email,
    phone: requirement.customerDetails.phone,
    countryCode: requirement.customerDetails.countryCode || '+1',
    country: requirement.customerDetails.country || 'Unknown',
    company: requirement.companyDetails.name || '',
    status: 'New',
    source: requirement.source || 'Website',
    assignedTo: requirement.assignedSalesPerson || req.user._id,
    course: requirement.selectedService || 'Consulting',
    remarks: requirement.internalNotes || '',
    createdBy: req.user._id
  };

  const lead = await Lead.create(leadData);

  // Link lead reference in requirement
  requirement.leadReference = lead._id;
  requirement.currentStatus = 'Contacted';
  requirement.activityLog.push({
    action: 'LEAD_CONVERSION',
    performedBy: req.user._id,
    details: `Converted requirement into Lead: ${lead.name} (${lead._id})`
  });

  await requirement.save();

  // Create custom Audit Log entry manually
  try {
    const Log = mongoose.model('Log');
    await Log.create({
      action: 'PROJECT_REQUIREMENT_CONVERT_LEAD',
      performedBy: req.user._id,
      timestamp: new Date(),
      details: {
        requirementId: requirement._id,
        requirementNumber: requirement.requirementNumber,
        leadId: lead._id,
        leadName: lead.name
      },
      affectedResource: 'ProjectRequirement',
      resourceId: requirement._id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'SUCCESS'
    });
  } catch (err) {
    console.error('Audit log error on lead conversion:', err.message);
  }

  res.status(200).json({
    success: true,
    data: requirement
  });
});

// @desc    Convert project requirement into a Client (Lead status Converted)
// @route   POST /api/project-requests/:id/convert-client
// @access  Private (Admin, Manager, Sales Person, Lead Person)
exports.convertToClient = asyncHandler(async (req, res, next) => {
  let requirement = await ProjectRequirement.findById(req.params.id);
  if (!requirement) {
    return next(new ErrorResponse(`Project requirement not found with ID of ${req.params.id}`, 404));
  }

  let lead;
  if (requirement.leadReference) {
    lead = await Lead.findById(requirement.leadReference);
    if (lead) {
      lead.status = 'Converted';
      await lead.save();
    }
  } else {
    // Create new Lead and set status to Converted
    const leadData = {
      name: requirement.customerDetails.name,
      email: requirement.customerDetails.email,
      phone: requirement.customerDetails.phone,
      countryCode: requirement.customerDetails.countryCode || '+1',
      country: requirement.customerDetails.country || 'Unknown',
      company: requirement.companyDetails.name || '',
      status: 'Converted',
      source: requirement.source || 'Website',
      assignedTo: requirement.assignedSalesPerson || req.user._id,
      course: requirement.selectedService || 'Consulting',
      remarks: requirement.internalNotes || '',
      createdBy: req.user._id
    };
    lead = await Lead.create(leadData);
    requirement.leadReference = lead._id;
  }

  requirement.currentStatus = 'Won';
  requirement.activityLog.push({
    action: 'CLIENT_CONVERSION',
    performedBy: req.user._id,
    details: `Converted requirement into Client: ${lead.name} (${lead._id})`
  });

  await requirement.save();

  // Create custom Audit Log entry manually
  try {
    const Log = mongoose.model('Log');
    await Log.create({
      action: 'PROJECT_REQUIREMENT_CONVERT_CLIENT',
      performedBy: req.user._id,
      timestamp: new Date(),
      details: {
        requirementId: requirement._id,
        requirementNumber: requirement.requirementNumber,
        leadId: lead._id,
        leadName: lead.name
      },
      affectedResource: 'ProjectRequirement',
      resourceId: requirement._id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'SUCCESS'
    });
  } catch (err) {
    console.error('Audit log error on client conversion:', err.message);
  }

  res.status(200).json({
    success: true,
    data: requirement
  });
});

// @desc    Get dashboard stats (Total, Today's, Pending, Won, Lost, Potential Revenue)
// @route   GET /api/project-requests/stats
// @access  Private (Admin, Manager, Sales Person, Lead Person)
exports.getDashboardStats = asyncHandler(async (req, res, next) => {
  let query = { currentStatus: { $ne: 'Archived' } };

  if (req.user.role === 'Sales Person' || req.user.role === 'Lead Person') {
    query.$or = [
      { assignedSalesPerson: req.user._id },
      { assignedProjectManager: req.user._id }
    ];
  }

  const allRequests = await ProjectRequirement.find(query);

  const total = allRequests.length;
  
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = allRequests.filter(r => new Date(r.createdAt) >= todayStart).length;
  
  const pending = allRequests.filter(r => !['Won', 'Lost', 'Archived'].includes(r.currentStatus)).length;
  const won = allRequests.filter(r => r.currentStatus === 'Won').length;
  const lost = allRequests.filter(r => r.currentStatus === 'Lost').length;
  
  const revenuePotential = allRequests
    .filter(r => r.currentStatus !== 'Lost')
    .reduce((sum, r) => sum + (r.budget?.amount || 0), 0);

  res.status(200).json({
    success: true,
    data: {
      total,
      today: todayCount,
      pending,
      won,
      lost,
      revenuePotential
    }
  });
});

// @desc    Get data analytics (Charts aggregates)
// @route   GET /api/project-requests/analytics
// @access  Private (Admin, Manager, Sales Person, Lead Person)
exports.getAnalytics = asyncHandler(async (req, res, next) => {
  let matchQuery = { currentStatus: { $ne: 'Archived' } };

  if (req.user.role === 'Sales Person' || req.user.role === 'Lead Person') {
    matchQuery.$or = [
      { assignedSalesPerson: req.user._id },
      { assignedProjectManager: req.user._id }
    ];
  }

  // 1. Requests by Service
  const byService = await ProjectRequirement.aggregate([
    { $match: matchQuery },
    { $group: { _id: '$selectedService', count: { $sum: 1 } } },
    { $project: { name: '$_id', value: '$count', _id: 0 } },
    { $sort: { value: -1 } }
  ]);

  // 2. Conversion Rate (Won vs Total)
  const conversionRateAgg = await ProjectRequirement.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        won: { $sum: { $cond: [{ $eq: ['$currentStatus', 'Won'] }, 1, 0] } }
      }
    }
  ]);
  const conversionRate = conversionRateAgg.length > 0 && conversionRateAgg[0].total > 0
    ? parseFloat(((conversionRateAgg[0].won / conversionRateAgg[0].total) * 100).toFixed(1))
    : 0;

  // 3. Budget Distribution
  const budgetDistribution = await ProjectRequirement.aggregate([
    { $match: matchQuery },
    {
      $bucket: {
        groupBy: '$budget.amount',
        boundaries: [0, 1000, 5000, 10000, 50000, 1000000],
        default: 'Other',
        output: {
          count: { $sum: 1 }
        }
      }
    }
  ]);
  const budgetBuckets = budgetDistribution.map(b => {
    let name = '';
    if (b._id === 0) name = '< $1k';
    else if (b._id === 1000) name = '$1k - $5k';
    else if (b._id === 5000) name = '$5k - $10k';
    else if (b._id === 10000) name = '$10k - $50k';
    else if (b._id === 50000) name = '$50k+';
    else name = 'Other';
    return { name, value: b.count };
  });

  // 4. Country Wise
  const countryWise = await ProjectRequirement.aggregate([
    { $match: matchQuery },
    { $group: { _id: '$customerDetails.country', count: { $sum: 1 } } },
    { $project: { name: { $ifNull: ['$_id', 'Unknown'] }, value: '$count', _id: 0 } },
    { $sort: { value: -1 } },
    { $limit: 10 }
  ]);

  // 5. Monthly Requests (Last 6 Months)
  const monthlyRequests = await ProjectRequirement.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
    { $limit: 6 }
  ]);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formattedMonthly = monthlyRequests.map(m => {
    return {
      name: `${months[m._id.month - 1]} ${m._id.year}`,
      value: m.count
    };
  });

  // 6. Top Industries
  const topIndustries = await ProjectRequirement.aggregate([
    { $match: matchQuery },
    { $group: { _id: '$companyDetails.industry', count: { $sum: 1 } } },
    { $project: { name: { $ifNull: ['$_id', 'General'] }, value: '$count', _id: 0 } },
    { $sort: { value: -1 } },
    { $limit: 10 }
  ]);

  res.status(200).json({
    success: true,
    data: {
      byService,
      conversionRate,
      budgetBuckets,
      countryWise,
      monthlyRequests: formattedMonthly,
      topIndustries
    }
  });
});

// @desc    Public website submission endpoint for project requirements
// @route   POST /api/public/project-request
// @access  Public
exports.createPublicRequirement = asyncHandler(async (req, res, next) => {
  // 1. Handle multipart form-data payload parsing (if 'data' string is provided)
  if (req.body.data && typeof req.body.data === 'string') {
    try {
      const parsed = JSON.parse(req.body.data);
      Object.assign(req.body, parsed);
    } catch (e) {
      return next(new ErrorResponse('Invalid JSON data payload inside multipart body', 400));
    }
  }

  const { customerDetails, selectedService } = req.body;
  if (!customerDetails || !customerDetails.name || !customerDetails.email || !selectedService) {
    return next(new ErrorResponse('Please provide customer name, email, and selected service', 400));
  }

  // 2. Handle file uploads if any
  const attachments = [];
  if (req.files && req.files.length > 0) {
    const { uploadFile } = require('../services/fileStorageService');
    for (const file of req.files) {
      try {
        const uploadResult = await uploadFile(file, 'requirements');
        attachments.push({
          fileName: file.originalname,
          url: uploadResult.url,
          key: uploadResult.key || '',
          size: file.size,
          mimetype: file.mimetype
        });
      } catch (uploadErr) {
        console.error('File upload failed during requirement submission:', uploadErr.message);
      }
    }
  }

  const requirementNumber = await ProjectRequirement.generateRequirementNumber();
  
  req.body.requirementNumber = requirementNumber;
  req.body.currentStatus = 'New';
  req.body.source = req.body.source || 'Website';
  req.body.attachments = attachments;
  req.body.activityLog = [
    {
      action: 'REQUIREMENT_SUBMIT',
      details: `Requirement submitted from ${req.body.source || 'Website'} with ${attachments.length} attachments.`
    }
  ];

  const requirement = await ProjectRequirement.create(req.body);

  // Trigger Notifications & Emails
  try {
    // 1. Fetch Admin & Manager role users
    const adminsAndManagers = await User.find({ role: { $in: ['Admin', 'Manager'] } });
    const adminEmails = adminsAndManagers.map(u => u.email).filter(Boolean);

    // 2. Persistent In-App Notifications
    await notificationService.notifyRoles({
      roles: ['Admin', 'Manager'],
      type: 'PROJECT_REQUIREMENT_NEW',
      message: `New Requirement ${requirementNumber} submitted by ${customerDetails.name} for ${selectedService}.`
    });

    // 3. Email Notifications
    if (adminEmails.length > 0) {
      const subject = `New Project Requirement Received: ${requirementNumber}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #4f46e5; text-align: center; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">New Project Requirement</h2>
          <p>Dear Administrator,</p>
          <p>A new project requirement has been submitted from the <strong>${req.body.source || 'Website'}</strong>.</p>
          <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 5px 0;"><strong>Requirement Number:</strong> ${requirementNumber}</p>
            <p style="margin: 5px 0;"><strong>Client Name:</strong> ${customerDetails.name}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${customerDetails.email}</p>
            <p style="margin: 5px 0;"><strong>Selected Service:</strong> ${selectedService}</p>
            <p style="margin: 5px 0;"><strong>Budget:</strong> ${req.body.budget?.amount || 'Not Specified'} ${req.body.budget?.currency || 'USD'}</p>
            <p style="margin: 5px 0;"><strong>Timeline:</strong> ${req.body.timeline || 'Not Specified'}</p>
          </div>
          <p>Please log in to the CRM to assign this requirement to a Sales Person or Project Manager.</p>
          <div style="text-align: center; margin-top: 25px;">
            <a href="https://traincapecrm.traincapetech.in/project-requirements" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">View in CRM</a>
          </div>
          <p style="margin-top: 30px; font-size: 11px; color: #6b7280; text-align: center; border-top: 1px solid #eee; padding-top: 10px;">This is an automated notification from Traincape CRM.</p>
        </div>
      `;

      for (const email of adminEmails) {
        try {
          await sendEmail(email, subject, null, html);
        } catch (emailErr) {
          console.error(`Email notification fail to ${email}:`, emailErr.message);
        }
      }
    }

    // 4. Emit Socket.IO event for Real-Time Toast in CRM
    const io = req.app.get('io');
    if (io) {
      io.emit('new_project_requirement', {
        _id: requirement._id,
        requirementNumber,
        customerDetails: { name: customerDetails.name, email: customerDetails.email },
        selectedService,
        currentStatus: 'New',
        createdAt: requirement.createdAt
      });
    }
  } catch (notifyErr) {
    console.error('Non-blocking notification system error:', notifyErr.message);
  }

  res.status(201).json({
    success: true,
    data: requirement
  });
});
