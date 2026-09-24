const collectionService = require('../services/collectionService');
const SaleCollectionAssignment = require('../models/SaleCollectionAssignment');
const Sale = require('../models/Sale');

// @desc    Get collection assignments for a specific sale (active + history)
// @route   GET /api/collections/sale/:saleId
// @access  Private
exports.getSaleCollections = async (req, res) => {
  try {
    const { saleId } = req.params;

    const sale = await Sale.findById(saleId).populate('salesPerson leadPerson', 'fullName email');
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found',
      });
    }

    const assignments = await SaleCollectionAssignment.find({ saleId })
      .populate('assignedTo', 'fullName email role profilePicture')
      .populate('assignedBy', 'fullName email')
      .populate('reassignedTo', 'fullName email')
      .populate('collections.collectedBy', 'fullName email')
      .sort({ createdAt: -1 });

    const outstanding = Math.max(0, (sale.totalCost || 0) - (sale.tokenAmount || 0));
    const activeAssignments = assignments.filter((a) => a.status === 'ACTIVE');
    const totalActiveAssigned = activeAssignments.reduce((sum, a) => sum + a.assignedAmount, 0);
    const unassignedAmount = Math.max(0, outstanding - totalActiveAssigned);

    res.status(200).json({
      success: true,
      data: {
        sale: {
          _id: sale._id,
          customerName: sale.customerName,
          course: sale.course,
          totalCost: sale.totalCost,
          tokenAmount: sale.tokenAmount,
          currency: sale.currency || 'USD',
          status: sale.status,
          pending: sale.pending,
          outstanding,
          salesPerson: sale.salesPerson,
          collectionStatus: sale.collectionStatus,
          totalCollectionAssigned: sale.totalCollectionAssigned,
          totalCollectionCollected: sale.totalCollectionCollected,
          totalCollectionRemaining: sale.totalCollectionRemaining,
        },
        outstanding,
        totalActiveAssigned,
        unassignedAmount,
        assignments,
      },
    });
  } catch (err) {
    console.error('Error fetching sale collections:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Server error fetching collection assignments',
    });
  }
};

// @desc    Assign collection responsibility (Single or Multiple)
// @route   POST /api/collections/assign
// @access  Private (Admin, Manager, Branch Partner)
exports.assignCollection = async (req, res) => {
  try {
    const { saleId, assignments } = req.body;

    if (!['Admin', 'Manager', 'Branch Partner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to assign collection ownership',
      });
    }

    const reqInfo = {
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
    };

    const created = await collectionService.assignCollection({
      saleId,
      assignments,
      assignedBy: req.user._id,
      userRole: req.user.role,
      reqInfo,
    });

    res.status(201).json({
      success: true,
      message: 'Collection ownership assigned successfully',
      data: created,
    });
  } catch (err) {
    console.error('Error in assignCollection:', err);
    res.status(400).json({
      success: false,
      message: err.message || 'Error assigning collection ownership',
    });
  }
};

// @desc    Reassign an active collection responsibility
// @route   POST /api/collections/reassign
// @access  Private (Admin, Manager, Branch Partner)
exports.reassignCollection = async (req, res) => {
  try {
    const { assignmentId, newAssignedTo, reassignmentReason, notes } = req.body;

    if (!['Admin', 'Manager', 'Branch Partner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reassign collection ownership',
      });
    }

    const reqInfo = {
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
    };

    const result = await collectionService.reassignCollection({
      assignmentId,
      newAssignedTo,
      reassignmentReason,
      reassignedBy: req.user._id,
      notes,
      reqInfo,
    });

    res.status(200).json({
      success: true,
      message: 'Collection responsibility reassigned successfully',
      data: result,
    });
  } catch (err) {
    console.error('Error in reassignCollection:', err);
    res.status(400).json({
      success: false,
      message: err.message || 'Error reassigning collection ownership',
    });
  }
};

// @desc    Record an explicit payment collected by an assignee
// @route   POST /api/collections/record-payment
// @access  Private
exports.recordCollectionPayment = async (req, res) => {
  try {
    const { assignmentId, amount, notes } = req.body;

    const assignment = await SaleCollectionAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Collection assignment not found',
      });
    }

    // Role check: Admin, Manager, or the assigned collector themselves
    const isOwner = assignment.assignedTo.toString() === req.user._id.toString();
    const isManagerial = ['Admin', 'Manager', 'Branch Partner'].includes(req.user.role);

    if (!isOwner && !isManagerial) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to record collection for this assignment',
      });
    }

    const reqInfo = {
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
    };

    const result = await collectionService.recordCollectionPayment({
      assignmentId,
      amount,
      collectedBy: req.user._id,
      notes,
      reqInfo,
    });

    res.status(200).json({
      success: true,
      message: 'Collection payment recorded successfully',
      data: result,
    });
  } catch (err) {
    console.error('Error in recordCollectionPayment:', err);
    res.status(400).json({
      success: false,
      message: err.message || 'Error recording collection payment',
    });
  }
};

// @desc    Get collection performance metrics
// @route   GET /api/collections/performance
// @access  Private
exports.getCollectionPerformance = async (req, res) => {
  try {
    let targetUserId = req.query.userId || null;

    // Sales persons can only query their own collection performance
    if (['Sales Person', 'Senior Sales Executive', 'Sales Executive'].includes(req.user.role)) {
      targetUserId = req.user._id.toString();
    }

    const { startDate, endDate } = req.query;

    const metrics = await collectionService.getCollectionPerformance({
      userId: targetUserId,
      startDate,
      endDate,
    });

    res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (err) {
    console.error('Error fetching collection performance:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Error fetching collection performance',
    });
  }
};

// @desc    Get active collections for an employee (e.g. before offboarding/reassigning)
// @route   GET /api/collections/user/:userId/active
// @access  Private (Admin, Manager, Self)
exports.getUserActiveCollections = async (req, res) => {
  try {
    const { userId } = req.params;

    if (
      req.user._id.toString() !== userId &&
      !['Admin', 'Manager', 'Branch Partner'].includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this user active collections',
      });
    }

    const assignments = await SaleCollectionAssignment.find({
      assignedTo: userId,
      status: 'ACTIVE',
    })
      .populate('saleId', 'customerName course totalCost tokenAmount currency date status')
      .populate('assignedBy', 'fullName email')
      .sort({ assignedAt: -1 });

    const totalActiveAssigned = assignments.reduce((sum, a) => sum + a.assignedAmount, 0);
    const totalCollected = assignments.reduce((sum, a) => sum + a.collectedAmount, 0);
    const totalRemaining = Math.max(0, totalActiveAssigned - totalCollected);

    res.status(200).json({
      success: true,
      count: assignments.length,
      data: {
        totalActiveAssigned,
        totalCollected,
        totalRemaining,
        assignments,
      },
    });
  } catch (err) {
    console.error('Error fetching user active collections:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Error fetching user active collections',
    });
  }
};

// @desc    Bulk reassign all active collections of a user (e.g. employee exit)
// @route   POST /api/collections/bulk-reassign
// @access  Private (Admin, Manager)
exports.bulkReassignUser = async (req, res) => {
  try {
    const { fromUserId, toUserId, reason } = req.body;

    if (!['Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin or Manager can perform bulk collection transfers',
      });
    }

    if (!fromUserId || !toUserId) {
      return res.status(400).json({
        success: false,
        message: 'fromUserId and toUserId are both required',
      });
    }

    const reqInfo = {
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
    };

    const result = await collectionService.bulkReassignUserCollections({
      fromUserId,
      toUserId,
      reason: reason || 'Employee departure handover',
      performedBy: req.user._id,
      reqInfo,
    });

    res.status(200).json({
      success: true,
      message: `Bulk reassignment complete. ${result.successCount} of ${result.totalAttempted} assignments transferred.`,
      data: result,
    });
  } catch (err) {
    console.error('Error in bulkReassignUser:', err);
    res.status(400).json({
      success: false,
      message: err.message || 'Error performing bulk collection reassignment',
    });
  }
};

// @desc    Preview pending sales eligible for bulk assignment
// @route   GET /api/collections/bulk-preview
// @access  Private (Admin, Manager)
exports.getBulkPreview = async (req, res) => {
  try {
    const { salesPersonId, collectorId } = req.query;

    const preview = await collectionService.getBulkPreview({
      salesPersonId: salesPersonId || null,
      collectorId: collectorId || null,
    });

    res.status(200).json({
      success: true,
      data: preview,
    });
  } catch (err) {
    console.error('Error in getBulkPreview:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Error generating bulk preview',
    });
  }
};

// @desc    Bulk assign all pending sales of a salesperson to a target collector
// @route   POST /api/collections/bulk-assign-salesperson
// @access  Private (Admin, Manager)
exports.bulkAssignSalesPersonPending = async (req, res) => {
  try {
    const { salesPersonId, targetCollectorId, reason } = req.body;

    if (!['Admin', 'Manager', 'Branch Partner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin or Manager can perform bulk collection assignments',
      });
    }

    if (!salesPersonId || !targetCollectorId) {
      return res.status(400).json({
        success: false,
        message: 'salesPersonId and targetCollectorId are both required',
      });
    }

    const reqInfo = {
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
    };

    const result = await collectionService.bulkAssignSalesPersonPending({
      salesPersonId,
      targetCollectorId,
      reason: reason || 'Bulk assignment of salesperson pending sales',
      performedBy: req.user._id,
      userRole: req.user.role,
      reqInfo,
    });

    res.status(200).json({
      success: true,
      message: `Bulk assignment complete. ${result.successCount} of ${result.totalSalesProcessed} sales assigned.`,
      data: result,
    });
  } catch (err) {
    console.error('Error in bulkAssignSalesPersonPending:', err);
    res.status(400).json({
      success: false,
      message: err.message || 'Error performing bulk salesperson collection assignment',
    });
  }
};

// @desc    Bulk assign collection for selected sales (from table checkboxes)
// @route   POST /api/collections/bulk-assign-selected
// @access  Private (Admin, Manager)
exports.bulkAssignSelectedSales = async (req, res) => {
  try {
    const { saleIds, targetCollectorId, reason } = req.body;

    if (!['Admin', 'Manager', 'Branch Partner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin or Manager can perform bulk collection assignments',
      });
    }

    if (!Array.isArray(saleIds) || saleIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please select at least one sale to assign',
      });
    }

    if (!targetCollectorId) {
      return res.status(400).json({
        success: false,
        message: 'targetCollectorId is required',
      });
    }

    const reqInfo = {
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
    };

    const result = await collectionService.bulkAssignSelectedSales({
      saleIds,
      targetCollectorId,
      reason: reason || 'Bulk assignment from table selection',
      performedBy: req.user._id,
      userRole: req.user.role,
      reqInfo,
    });

    res.status(200).json({
      success: true,
      message: `Bulk assignment complete. ${result.successCount} of ${result.totalSalesProcessed} sales assigned.`,
      data: result,
    });
  } catch (err) {
    console.error('Error in bulkAssignSelectedSales:', err);
    res.status(400).json({
      success: false,
      message: err.message || 'Error performing bulk selected collection assignment',
    });
  }
};
