const mongoose = require('mongoose');
const SaleCollectionAssignment = require('../models/SaleCollectionAssignment');
const Sale = require('../models/Sale');
const User = require('../models/User');
const Log = require('../models/Log');
const notificationService = require('./notificationService');

/**
 * Synchronize collection summary fields on the parent Sale document
 * without touching or modifying the original salesPerson or totalCost.
 */
const syncSaleCollectionSummary = async (saleId) => {
  const sale = await Sale.findById(saleId);
  if (!sale) return null;

  const assignments = await SaleCollectionAssignment.find({ saleId }).populate(
    'assignedTo',
    'fullName email'
  );

  const activeAssignments = assignments.filter((a) => a.status === 'ACTIVE');
  const currentCollectionOwners = activeAssignments.map((a) => a.assignedTo?._id || a.assignedTo);

  const totalAssigned = activeAssignments.reduce(
    (sum, a) => sum + (parseFloat(a.assignedAmount) || 0),
    0
  );
  const totalCollected = assignments.reduce(
    (sum, a) => sum + (parseFloat(a.collectedAmount) || 0),
    0
  );

  const activeCollected = activeAssignments.reduce(
    (sum, a) => sum + (parseFloat(a.collectedAmount) || 0),
    0
  );
  const totalRemaining = Math.max(0, totalAssigned - activeCollected);

  const outstanding = Math.max(0, (sale.totalCost || 0) - (sale.tokenAmount || 0));

  let collectionStatus = 'UNASSIGNED';
  if (sale.status === 'Completed' || (outstanding === 0 && totalCollected > 0)) {
    collectionStatus = 'COLLECTED';
  } else if (activeAssignments.length === 0) {
    collectionStatus = 'UNASSIGNED';
  } else if (totalAssigned >= outstanding) {
    collectionStatus = 'ASSIGNED';
  } else {
    collectionStatus = 'PARTIALLY_ASSIGNED';
  }

  sale.collectionStatus = collectionStatus;
  sale.currentCollectionOwners = currentCollectionOwners;
  sale.totalCollectionAssigned = totalAssigned;
  sale.totalCollectionCollected = totalCollected;
  sale.totalCollectionRemaining = totalRemaining;

  await sale.save();
  return sale;
};

/**
 * Assign collection responsibility for a sale's outstanding amount.
 * Supports both full allocation to one person and distributed allocation to multiple people.
 */
const assignCollection = async ({ saleId, assignments, assignedBy, userRole, reqInfo = {} }) => {
  const sale = await Sale.findById(saleId).populate('salesPerson', 'fullName email');
  if (!sale) {
    throw new Error('Sale not found');
  }

  if (sale.status === 'Cancelled') {
    throw new Error('Cannot assign collection on a cancelled sale');
  }

  const outstanding = Math.max(0, (sale.totalCost || 0) - (sale.tokenAmount || 0));
  if (outstanding <= 0 || sale.status === 'Completed') {
    throw new Error('This sale is already completed with no outstanding amount to collect');
  }

  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    throw new Error('Please provide at least one collection assignment');
  }

  // Calculate existing active assignment amount
  const existingActive = await SaleCollectionAssignment.find({
    saleId,
    status: 'ACTIVE',
  });
  const currentActiveTotal = existingActive.reduce(
    (sum, a) => sum + (parseFloat(a.assignedAmount) || 0),
    0
  );

  const newTotal = assignments.reduce((sum, a) => {
    const amt = parseFloat(a.assignedAmount);
    if (isNaN(amt) || amt <= 0) {
      throw new Error('Each assigned amount must be greater than zero');
    }
    return sum + amt;
  }, 0);

  // Validate that total assigned does not exceed the current outstanding amount
  if (currentActiveTotal + newTotal > outstanding + 0.01) {
    throw new Error(
      `Total assigned amount (${(currentActiveTotal + newTotal).toFixed(
        2
      )}) cannot exceed the outstanding balance (${outstanding.toFixed(2)}).`
    );
  }

  const createdRecords = [];

  for (const item of assignments) {
    const collector = await User.findById(item.assignedTo);
    if (!collector) {
      throw new Error(`User with ID ${item.assignedTo} does not exist`);
    }

    // Prevent duplicate active assignments to the exact same user on the same sale
    const duplicate = existingActive.find(
      (ea) => ea.assignedTo.toString() === item.assignedTo.toString()
    );
    if (duplicate) {
      throw new Error(
        `${collector.fullName} already has an active collection assignment on this sale.`
      );
    }

    const assignmentDoc = await SaleCollectionAssignment.create({
      saleId,
      assignedTo: item.assignedTo,
      assignedAmount: parseFloat(item.assignedAmount),
      collectedAmount: 0,
      currency: sale.currency || 'USD',
      status: 'ACTIVE',
      assignedBy,
      notes: item.notes || '',
    });

    createdRecords.push(assignmentDoc);
  }

  await syncSaleCollectionSummary(saleId);

  // Create descriptive audit log entry
  try {
    await Log.create({
      action: 'COLLECTION_ASSIGN',
      performedBy: assignedBy,
      timestamp: new Date(),
      details: {
        saleId,
        customerName: sale.customerName,
        originalSalesPerson: sale.salesPerson?.fullName || sale.salesPerson,
        assignments: assignments.map((a) => ({
          assignedTo: a.assignedTo,
          amount: a.assignedAmount,
        })),
        outstanding,
      },
      affectedResource: 'SaleCollectionAssignment',
      resourceId: saleId,
      status: 'SUCCESS',
      ipAddress: reqInfo.ipAddress || '',
      userAgent: reqInfo.userAgent || '',
    });

    await notificationService.notifyAdmins({
      type: 'ACTIVITY',
      message: `Collection responsibility assigned for sale of ${sale.customerName} (${sale.course}). Total Assigned: ${newTotal} ${sale.currency || 'USD'}. Original Closer: ${sale.salesPerson?.fullName || 'Sales Rep'}.`,
      data: { saleId },
    });
  } catch (logErr) {
    console.error('Non-blocking collection audit log error:', logErr);
  }

  return createdRecords;
};

/**
 * Reassign an active collection responsibility to a new employee.
 * Preserves the previous assignment history and creates a new active assignment.
 */
const reassignCollection = async ({
  assignmentId,
  newAssignedTo,
  reassignmentReason,
  reassignedBy,
  notes = '',
  reqInfo = {},
}) => {
  const existing = await SaleCollectionAssignment.findById(assignmentId).populate('assignedTo', 'fullName email');
  if (!existing) {
    throw new Error('Collection assignment not found');
  }

  if (existing.status !== 'ACTIVE') {
    throw new Error(`Cannot reassign an assignment with status "${existing.status}"`);
  }

  if (existing.assignedTo._id.toString() === newAssignedTo.toString()) {
    throw new Error('Cannot reassign to the same user who is already assigned');
  }

  const newCollector = await User.findById(newAssignedTo);
  if (!newCollector || !newCollector.active) {
    throw new Error('New collection owner is invalid or inactive');
  }

  if (!reassignmentReason || !reassignmentReason.trim()) {
    throw new Error('Please provide a reason for reassignment');
  }

  const remaining = Math.max(0, existing.assignedAmount - existing.collectedAmount);
  if (remaining <= 0) {
    throw new Error('This assignment has already been completely collected and cannot be reassigned');
  }

  const sale = await Sale.findById(existing.saleId).populate('salesPerson', 'fullName');

  // Mark old assignment as REASSIGNED (Immutable preservation of historical work)
  existing.status = 'REASSIGNED';
  existing.reassignedTo = newAssignedTo;
  existing.reassignedAt = new Date();
  existing.reassignmentReason = reassignmentReason.trim();
  existing.notes = existing.notes
    ? `${existing.notes} | Reassigned: ${reassignmentReason}`
    : `Reassigned: ${reassignmentReason}`;
  await existing.save();

  // Create new active assignment for the new collector with the remaining uncollected balance
  const newAssignment = await SaleCollectionAssignment.create({
    saleId: existing.saleId,
    assignedTo: newAssignedTo,
    assignedAmount: remaining,
    collectedAmount: 0,
    currency: existing.currency,
    status: 'ACTIVE',
    assignedBy: reassignedBy,
    notes: notes || `Reassigned from ${existing.assignedTo.fullName}. Reason: ${reassignmentReason}`,
  });

  await syncSaleCollectionSummary(existing.saleId);

  // Log audit trail
  try {
    await Log.create({
      action: 'COLLECTION_REASSIGN',
      performedBy: reassignedBy,
      timestamp: new Date(),
      details: {
        saleId: existing.saleId,
        previousCollector: existing.assignedTo.fullName,
        previousCollectorId: existing.assignedTo._id,
        newCollector: newCollector.fullName,
        newCollectorId: newCollector._id,
        reassignedAmount: remaining,
        collectedByPrevious: existing.collectedAmount,
        reason: reassignmentReason,
        originalSalesPerson: sale?.salesPerson?.fullName || 'Sales Rep',
      },
      affectedResource: 'SaleCollectionAssignment',
      resourceId: existing._id,
      status: 'SUCCESS',
      ipAddress: reqInfo.ipAddress || '',
      userAgent: reqInfo.userAgent || '',
    });

    await notificationService.notifyAdmins({
      type: 'ACTIVITY',
      message: `Collection reassigned: ${existing.assignedTo.fullName} → ${newCollector.fullName} for ${sale?.customerName || 'Customer'} (Amount: ${remaining} ${existing.currency}). Reason: ${reassignmentReason}`,
      data: { saleId: existing.saleId },
    });
  } catch (logErr) {
    console.error('Non-blocking collection reassignment log error:', logErr);
  }

  return {
    previousAssignment: existing,
    newAssignment,
  };
};

/**
 * Record an explicit payment collected by a specific collection owner.
 * Updates the assignment's collected amount and syncs with Sale.tokenAmount.
 */
const recordCollectionPayment = async ({
  assignmentId,
  amount,
  collectedBy,
  notes = '',
  reqInfo = {},
}) => {
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new Error('Collection amount must be greater than zero');
  }

  const assignment = await SaleCollectionAssignment.findById(assignmentId).populate('assignedTo', 'fullName');
  if (!assignment) {
    throw new Error('Collection assignment not found');
  }

  if (assignment.status !== 'ACTIVE') {
    throw new Error(`Cannot record collection on an assignment with status "${assignment.status}"`);
  }

  const remaining = Math.max(0, assignment.assignedAmount - assignment.collectedAmount);
  if (parsedAmount > remaining + 0.01) {
    throw new Error(
      `Collection amount (${parsedAmount.toFixed(2)}) cannot exceed remaining assigned balance (${remaining.toFixed(2)})`
    );
  }

  const sale = await Sale.findById(assignment.saleId);
  if (!sale) {
    throw new Error('Related sale not found');
  }

  // Record this payment in assignment's collection subdocument
  assignment.collections.push({
    amount: parsedAmount,
    collectedBy,
    collectedAt: new Date(),
    notes: notes || '',
  });

  assignment.collectedAmount += parsedAmount;
  if (assignment.collectedAmount >= assignment.assignedAmount - 0.01) {
    assignment.status = 'COMPLETED';
    assignment.completedAt = new Date();
  }
  await assignment.save();

  // Update Sale.tokenAmount and check completion
  sale.tokenAmount = (sale.tokenAmount || 0) + parsedAmount;
  if (sale.tokenAmount >= (sale.totalCost || 0) - 0.01) {
    sale.tokenAmount = sale.totalCost;
    sale.status = 'Completed';
    sale.pending = false;
  }
  await sale.save();

  await syncSaleCollectionSummary(sale._id);

  // Audit log entry
  try {
    await Log.create({
      action: 'COLLECTION_COLLECT',
      performedBy: collectedBy,
      timestamp: new Date(),
      details: {
        saleId: sale._id,
        assignmentId: assignment._id,
        collector: assignment.assignedTo?.fullName,
        collectorId: assignment.assignedTo?._id,
        amountCollected: parsedAmount,
        totalCollectedOnAssignment: assignment.collectedAmount,
        assignedAmount: assignment.assignedAmount,
        notes,
      },
      affectedResource: 'SaleCollectionAssignment',
      resourceId: assignment._id,
      status: 'SUCCESS',
      ipAddress: reqInfo.ipAddress || '',
      userAgent: reqInfo.userAgent || '',
    });
  } catch (logErr) {
    console.error('Non-blocking collection payment log error:', logErr);
  }

  return { assignment, sale };
};

/**
 * Automatically settle active collection assignments when a sale is marked Complete
 * through the existing sales tracking workflow (e.g. rep updates sale status to Complete).
 */
const settleSaleCollectionsOnComplete = async (sale, updatedBy) => {
  if (!sale || sale.status !== 'Completed') return;

  const activeAssignments = await SaleCollectionAssignment.find({
    saleId: sale._id,
    status: 'ACTIVE',
  });

  if (activeAssignments.length === 0) {
    await syncSaleCollectionSummary(sale._id);
    return;
  }

  for (const assignment of activeAssignments) {
    const uncollected = Math.max(0, assignment.assignedAmount - assignment.collectedAmount);
    if (uncollected > 0) {
      assignment.collectedAmount = assignment.assignedAmount;
      assignment.status = 'COMPLETED';
      assignment.completedAt = new Date();
      assignment.collections.push({
        amount: uncollected,
        collectedBy: updatedBy || assignment.assignedTo,
        collectedAt: new Date(),
        notes: 'Automatically settled upon sale status completion',
      });
      await assignment.save();
    }
  }

  await syncSaleCollectionSummary(sale._id);
};

/**
 * Get collection performance metrics separated completely from sales revenue.
 */
const getCollectionPerformance = async ({ userId = null, startDate = null, endDate = null }) => {
  const matchFilter = {};

  if (userId) {
    matchFilter.assignedTo = new mongoose.Types.ObjectId(userId);
  }

  if (startDate || endDate) {
    matchFilter.assignedAt = {};
    if (startDate) matchFilter.assignedAt.$gte = new Date(startDate);
    if (endDate) matchFilter.assignedAt.$lte = new Date(endDate);
  }

  const allAssignments = await SaleCollectionAssignment.find(matchFilter)
    .populate('assignedTo', 'fullName email')
    .populate('assignedBy', 'fullName')
    .populate('saleId', 'customerName course totalCost tokenAmount status salesPerson currency');

  let totalAssigned = 0;
  let totalCollected = 0;
  let totalRemaining = 0;
  let activeCount = 0;
  let completedCount = 0;
  let reassignedCount = 0;

  const repBreakdown = {};

  allAssignments.forEach((a) => {
    const repId = a.assignedTo?._id?.toString() || 'unknown';
    const repName = a.assignedTo?.fullName || 'Unassigned';

    if (!repBreakdown[repId]) {
      repBreakdown[repId] = {
        userId: repId,
        userName: repName,
        assignedCount: 0,
        completedCount: 0,
        activeCount: 0,
        reassignedCount: 0,
        totalAssigned: 0,
        totalCollected: 0,
        totalRemaining: 0,
      };
    }

    const assignedAmt = parseFloat(a.assignedAmount) || 0;
    const collectedAmt = parseFloat(a.collectedAmount) || 0;
    const remainingAmt = Math.max(0, assignedAmt - collectedAmt);

    repBreakdown[repId].assignedCount += 1;
    repBreakdown[repId].totalAssigned += assignedAmt;
    repBreakdown[repId].totalCollected += collectedAmt;

    if (a.status === 'ACTIVE') {
      activeCount += 1;
      totalAssigned += assignedAmt;
      totalCollected += collectedAmt;
      totalRemaining += remainingAmt;

      repBreakdown[repId].activeCount += 1;
      repBreakdown[repId].totalRemaining += remainingAmt;
    } else if (a.status === 'COMPLETED') {
      completedCount += 1;
      totalAssigned += assignedAmt;
      totalCollected += collectedAmt;

      repBreakdown[repId].completedCount += 1;
    } else if (a.status === 'REASSIGNED') {
      reassignedCount += 1;
      // For historical reassigned records, only count what this rep actually collected
      totalCollected += collectedAmt;
      repBreakdown[repId].reassignedCount += 1;
    }
  });

  const recoveryRate = totalAssigned > 0 ? ((totalCollected / totalAssigned) * 100).toFixed(1) : 0;

  return {
    kpis: {
      totalAssigned,
      totalCollected,
      totalRemaining,
      recoveryRate: parseFloat(recoveryRate),
      activeCount,
      completedCount,
      reassignedCount,
      totalCount: allAssignments.length,
    },
    repBreakdown: Object.values(repBreakdown),
    assignments: allAssignments,
  };
};

/**
 * Bulk reassign all active collection responsibilities of an employee (e.g. employee leaving).
 */
const bulkReassignUserCollections = async ({
  fromUserId,
  toUserId,
  reason = 'Employee departure',
  performedBy,
  reqInfo = {},
}) => {
  const activeAssignments = await SaleCollectionAssignment.find({
    assignedTo: fromUserId,
    status: 'ACTIVE',
  });

  const results = [];
  for (const assignment of activeAssignments) {
    try {
      const res = await reassignCollection({
        assignmentId: assignment._id,
        newAssignedTo: toUserId,
        reassignmentReason: reason,
        reassignedBy: performedBy,
        notes: `Bulk transferred due to: ${reason}`,
        reqInfo,
      });
      results.push({ assignmentId: assignment._id, success: true, data: res });
    } catch (err) {
      results.push({ assignmentId: assignment._id, success: false, error: err.message });
    }
  }

  return {
    totalAttempted: activeAssignments.length,
    successCount: results.filter((r) => r.success).length,
    results,
  };
};

/**
 * Preview pending sales for bulk assignment
 */
const getBulkPreview = async ({ salesPersonId, collectorId }) => {
  const query = { status: 'Pending' };

  if (salesPersonId) {
    query.salesPerson = salesPersonId;
  }

  const sales = await Sale.find(query)
    .populate('salesPerson', 'fullName email')
    .populate('currentCollectionOwners', 'fullName email')
    .sort({ createdAt: -1 });

  const eligibleSales = [];
  let totalPendingAmount = 0;

  for (const sale of sales) {
    const total = parseFloat(sale.totalCost || sale.amount || 0);
    const paid = parseFloat(sale.tokenAmount || sale.token || 0);
    const pending = Math.max(0, total - paid);

    if (pending <= 0) continue;

    // If collectorId is specified, check if this collector is currently assigned
    if (collectorId) {
      const isAssigned = (sale.currentCollectionOwners || []).some(
        (o) => (o._id ? o._id.toString() : o.toString()) === collectorId.toString()
      );
      if (!isAssigned) continue;
    }

    totalPendingAmount += pending;
    eligibleSales.push({
      _id: sale._id,
      customerName: sale.customerName,
      product: sale.course || sale.product || 'Unknown',
      currency: sale.currency || 'USD',
      date: sale.date || sale.createdAt,
      totalCost: total,
      tokenAmount: paid,
      pendingAmount: pending,
      salesPerson: sale.salesPerson,
      currentCollectionOwners: sale.currentCollectionOwners,
      collectionStatus: sale.collectionStatus || 'UNASSIGNED',
    });
  }

  return {
    count: eligibleSales.length,
    totalPendingAmount,
    sales: eligibleSales,
  };
};

/**
 * Bulk assign collection for all pending sales of a salesperson (e.g. Divyam's pending sales to Ningshen)
 */
const bulkAssignSalesPersonPending = async ({
  salesPersonId,
  targetCollectorId,
  reason = 'Bulk assignment of salesperson pending sales',
  performedBy,
  userRole = 'Admin',
  reqInfo = {},
}) => {
  const targetUser = await User.findById(targetCollectorId);
  if (!targetUser || targetUser.active === false) {
    throw new Error('Target collection owner is invalid or inactive');
  }

  const salesPerson = await User.findById(salesPersonId);
  if (!salesPerson) {
    throw new Error('Sales person not found');
  }

  // Find all pending sales made by this salesperson
  const sales = await Sale.find({
    salesPerson: salesPersonId,
    status: 'Pending',
  });

  const results = [];
  let totalAssignedAmount = 0;

  for (const sale of sales) {
    const total = parseFloat(sale.totalCost || sale.amount || 0);
    const paid = parseFloat(sale.tokenAmount || sale.token || 0);
    const pending = Math.max(0, total - paid);

    if (pending <= 0) continue;

    try {
      // Check if sale has existing active assignments
      const activeAssignments = await SaleCollectionAssignment.find({
        saleId: sale._id,
        status: 'ACTIVE',
      });

      if (activeAssignments.length > 0) {
        // Reassign existing active assignments to targetCollectorId
        for (const existingAsgn of activeAssignments) {
          if (existingAsgn.assignedTo.toString() === targetCollectorId.toString()) {
            continue;
          }
          await reassignCollection({
            assignmentId: existingAsgn._id,
            newAssignedTo: targetCollectorId,
            reassignmentReason: reason,
            reassignedBy: performedBy,
            notes: `Bulk transferred from ${salesPerson.fullName}'s sales: ${reason}`,
            reqInfo,
          });
        }
      } else {
        // Unassigned pending balance -> assign to targetCollectorId
        await assignCollection({
          saleId: sale._id,
          assignments: [{ assignedTo: targetCollectorId, assignedAmount: pending }],
          assignedBy: performedBy,
          userRole,
          reqInfo,
        });
      }

      await syncSaleCollectionSummary(sale._id);
      totalAssignedAmount += pending;
      results.push({ saleId: sale._id, success: true, pendingAmount: pending });
    } catch (err) {
      results.push({ saleId: sale._id, success: false, error: err.message });
    }
  }

  return {
    salesPerson: { _id: salesPerson._id, fullName: salesPerson.fullName },
    targetCollector: { _id: targetUser._id, fullName: targetUser.fullName },
    totalSalesProcessed: sales.length,
    successCount: results.filter((r) => r.success).length,
    totalAssignedAmount,
    results,
  };
};

/**
 * Bulk assign collection for an arbitrary list of selected sale IDs (e.g. from table multi-select)
 */
const bulkAssignSelectedSales = async ({
  saleIds = [],
  targetCollectorId,
  reason = 'Bulk assignment from table selection',
  performedBy,
  userRole = 'Admin',
  reqInfo = {},
}) => {
  const targetUser = await User.findById(targetCollectorId);
  if (!targetUser || targetUser.active === false) {
    throw new Error('Target collection owner is invalid or inactive');
  }

  if (!Array.isArray(saleIds) || saleIds.length === 0) {
    throw new Error('No sales selected for bulk assignment');
  }

  const sales = await Sale.find({ _id: { $in: saleIds } });
  const results = [];
  let totalAssignedAmount = 0;

  for (const sale of sales) {
    if (sale.status === 'Completed' || sale.status === 'Cancelled') {
      continue;
    }

    const total = parseFloat(sale.totalCost || sale.amount || 0);
    const paid = parseFloat(sale.tokenAmount || sale.token || 0);
    const pending = Math.max(0, total - paid);

    if (pending <= 0) continue;

    try {
      const activeAssignments = await SaleCollectionAssignment.find({
        saleId: sale._id,
        status: 'ACTIVE',
      });

      if (activeAssignments.length > 0) {
        for (const existingAsgn of activeAssignments) {
          if (existingAsgn.assignedTo.toString() === targetCollectorId.toString()) {
            continue;
          }
          await reassignCollection({
            assignmentId: existingAsgn._id,
            newAssignedTo: targetCollectorId,
            reassignmentReason: reason,
            reassignedBy: performedBy,
            notes: `Bulk selected assignment: ${reason}`,
            reqInfo,
          });
        }
      } else {
        await assignCollection({
          saleId: sale._id,
          assignments: [{ assignedTo: targetCollectorId, assignedAmount: pending }],
          assignedBy: performedBy,
          userRole,
          reqInfo,
        });
      }

      await syncSaleCollectionSummary(sale._id);
      totalAssignedAmount += pending;
      results.push({ saleId: sale._id, success: true, pendingAmount: pending });
    } catch (err) {
      results.push({ saleId: sale._id, success: false, error: err.message });
    }
  }

  return {
    targetCollector: { _id: targetUser._id, fullName: targetUser.fullName },
    totalSalesProcessed: saleIds.length,
    successCount: results.filter((r) => r.success).length,
    totalAssignedAmount,
    results,
  };
};

module.exports = {
  syncSaleCollectionSummary,
  assignCollection,
  reassignCollection,
  recordCollectionPayment,
  settleSaleCollectionsOnComplete,
  getCollectionPerformance,
  bulkReassignUserCollections,
  getBulkPreview,
  bulkAssignSalesPersonPending,
  bulkAssignSelectedSales,
};
