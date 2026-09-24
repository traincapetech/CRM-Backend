const asyncHandler = require("../middleware/async");
const Sale = require("../models/Sale");
const Lead = require("../models/Lead");
const Branch = require("../models/Branch");
const Employee = require("../models/Employee");

// Helper to compute date range filter
const getDateFilter = (query) => {
  const { startDate, endDate, period } = query;
  const now = new Date();

  if (startDate || endDate) {
    const filter = {};
    if (startDate) filter.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.$lte = end;
    }
    return filter;
  }

  if (period === "thisMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { $gte: start, $lte: now };
  } else if (period === "lastMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { $gte: start, $lte: end };
  } else if (period === "thisQuarter") {
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), quarterMonth, 1);
    return { $gte: start, $lte: now };
  } else if (period === "thisYear") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { $gte: start, $lte: now };
  }

  return null; // All time
};

// @desc    Get all sales with branch info & employee stats (returns all statuses for complete sales rep breakdown)
// @route   GET /api/branch-analytics/summary
// @access  Private (Admin, Manager, HR)
exports.getBranchSalesSummary = asyncHandler(async (req, res, next) => {
  const dateFilter = getDateFilter(req.query);

  // 1. Fetch configured branches
  let branches;
  if (req.user.role === "Branch Partner") {
    let targetBranchIds = req.user.branchIds || [];
    if (targetBranchIds.length === 0 && req.user.branchId) {
      targetBranchIds = [req.user.branchId];
    }
    if (targetBranchIds.length === 0) {
      const emp = await Employee.findOne({ userId: req.user._id });
      if (emp && emp.branchId) targetBranchIds = [emp.branchId];
    }
    if (targetBranchIds.length > 0) {
      branches = await Branch.find({ _id: { $in: targetBranchIds } });
    } else {
      branches = await Branch.find({});
    }
  } else {
    branches = await Branch.find({});
  }
  const actualDelhiHQ = (await Branch.findOne({ code: "DEL" })) || branches[0];
  const delhiHQ = actualDelhiHQ;

  // 2. Get all Sales joined with user→employee→branch
  const salesMatch = {};
  if (dateFilter) salesMatch.date = dateFilter;

  const allSales = await Sale.aggregate([
    { $match: salesMatch },
    {
      $lookup: {
        from: "users",
        localField: "salesPerson",
        foreignField: "_id",
        as: "salesPersonUser",
      },
    },
    { $unwind: { path: "$salesPersonUser", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "branches",
        localField: "salesPersonUser.branchId",
        foreignField: "_id",
        as: "userBranch",
      },
    },
    { $unwind: { path: "$userBranch", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "employees",
        localField: "salesPersonUser._id",
        foreignField: "userId",
        as: "employee",
      },
    },
    { $unwind: { path: "$employee", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "branches",
        localField: "employee.branchId",
        foreignField: "_id",
        as: "empBranch",
      },
    },
    { $unwind: { path: "$empBranch", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "branches",
        localField: "branchId",
        foreignField: "_id",
        as: "saleBranch",
      },
    },
    { $unwind: { path: "$saleBranch", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        totalCost: 1,
        tokenAmount: 1,
        currency: 1,
        status: 1,
        date: 1,
        course: 1,
        customerName: 1,
        salesPersonName: {
          $ifNull: [
            "$salesPersonUser.fullName",
            {
              $ifNull: [
                "$salesPersonUser.name",
                {
                  $ifNull: [
                    "$employee.fullName",
                    { $ifNull: ["$salesPersonUser.email", "Sales Rep"] }
                  ]
                }
              ]
            }
          ]
        },
        salesPersonId: "$salesPersonUser._id",
        branchId: {
          $ifNull: [
            "$userBranch._id",
            { $ifNull: ["$empBranch._id", { $ifNull: ["$saleBranch._id", actualDelhiHQ?._id || null] }] }
          ]
        },
        branchName: {
          $ifNull: [
            "$userBranch.name",
            { $ifNull: ["$empBranch.name", { $ifNull: ["$saleBranch.name", actualDelhiHQ?.name || "Delhi HQ"] }] }
          ]
        },
        branchCode: {
          $ifNull: [
            "$userBranch.code",
            { $ifNull: ["$empBranch.code", { $ifNull: ["$saleBranch.code", actualDelhiHQ?.code || "DEL"] }] }
          ]
        },
      },
    },
  ]);

  // 3. Lead conversion metrics per branch
  const leadMatch = {};
  if (dateFilter) leadMatch.createdAt = dateFilter;

  const leadAggregation = await Lead.aggregate([
    { $match: leadMatch },
    {
      $lookup: {
        from: "users", localField: "assignedTo", foreignField: "_id", as: "assignedUser",
      },
    },
    { $unwind: { path: "$assignedUser", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "employees", localField: "assignedUser._id", foreignField: "userId", as: "employee",
      },
    },
    { $unwind: { path: "$employee", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "branches", localField: "employee.branchId", foreignField: "_id", as: "branch",
      },
    },
    { $unwind: { path: "$branch", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ["$branch._id", delhiHQ?._id || "UNASSIGNED"] },
        totalLeads: { $sum: 1 },
        convertedLeads: {
          $sum: { $cond: [{ $in: ["$status", ["Converted", "Payment"]] }, 1, 0] },
        },
        lostLeads: {
          $sum: { $cond: [{ $eq: ["$status", "Lost"] }, 1, 0] },
        },
      },
    },
  ]);

  // 4. Employee Staff Counts per branch
  const employeeCounts = await Employee.aggregate([
    { $match: { status: { $in: ["ACTIVE", "PROBATION", "PERMANENT"] } } },
    {
      $group: {
        _id: { $ifNull: ["$branchId", delhiHQ?._id || "UNASSIGNED"] },
        staffCount: { $sum: 1 },
      },
    },
  ]);

  // 5. Operational Expenses per branch (Approved / Paid)
  const Expense = require("../models/Expense");
  const Payroll = require("../models/Payroll");

  const expenseMatch = { status: { $in: ["APPROVED", "PAID"] } };
  if (dateFilter) expenseMatch.date = dateFilter;

  const expenseAggregation = await Expense.aggregate([
    { $match: expenseMatch },
    {
      $lookup: {
        from: "employees", localField: "employeeId", foreignField: "_id", as: "employee",
      },
    },
    { $unwind: { path: "$employee", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ["$branchId", { $ifNull: ["$employee.branchId", delhiHQ?._id || "UNASSIGNED"] }] },
        totalExpenses: { $sum: "$amount" },
        expenseCount: { $sum: 1 },
      },
    },
  ]);

  // 6. Payroll Expenses per branch
  const payrollAggregation = await Payroll.aggregate([
    {
      $lookup: {
        from: "employees", localField: "employeeId", foreignField: "_id", as: "employee",
      },
    },
    { $unwind: { path: "$employee", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ["$employee.branchId", delhiHQ?._id || "UNASSIGNED"] },
        totalPayroll: { $sum: { $ifNull: ["$calculatedSalary", "$baseSalary"] } },
        payrollCount: { $sum: 1 },
      },
    },
  ]);

  // 7. Return raw sales data + branches + lead metrics + staff counts + expenses + payroll
  res.status(200).json({
    success: true,
    data: {
      sales: allSales,
      branches: branches.map((b) => ({
        _id: b._id,
        name: b.name,
        code: b.code,
        city: b.city,
        state: b.state,
        status: b.status,
      })),
      leadMetrics: leadAggregation,
      staffCounts: employeeCounts,
      expenseMetrics: expenseAggregation,
      payrollMetrics: payrollAggregation,
      activeBranchesCount: branches.filter((b) => b.status).length,
    },
  });
});

// @desc    Get Branch Monthly Revenue Trends
// @route   GET /api/branch-analytics/trends
// @access  Private (Admin, Manager, HR)
exports.getBranchMonthlyTrends = asyncHandler(async (req, res, next) => {
  const dateFilter = getDateFilter(req.query);

  const salesMatch = { status: { $ne: "Cancelled" } };
  if (dateFilter) {
    salesMatch.date = dateFilter;
  } else {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    salesMatch.date = { $gte: oneYearAgo };
  }

  const actualDelhiHQ = (await Branch.findOne({ code: "DEL" })) || (await Branch.findOne({}));

  const rawSales = await Sale.aggregate([
    { $match: salesMatch },
    {
      $lookup: { from: "users", localField: "salesPerson", foreignField: "_id", as: "salesPersonUser" },
    },
    { $unwind: { path: "$salesPersonUser", preserveNullAndEmptyArrays: true } },
    {
      $lookup: { from: "branches", localField: "salesPersonUser.branchId", foreignField: "_id", as: "userBranch" },
    },
    { $unwind: { path: "$userBranch", preserveNullAndEmptyArrays: true } },
    {
      $lookup: { from: "employees", localField: "salesPersonUser._id", foreignField: "userId", as: "employee" },
    },
    { $unwind: { path: "$employee", preserveNullAndEmptyArrays: true } },
    {
      $lookup: { from: "branches", localField: "employee.branchId", foreignField: "_id", as: "empBranch" },
    },
    { $unwind: { path: "$empBranch", preserveNullAndEmptyArrays: true } },
    {
      $lookup: { from: "branches", localField: "branchId", foreignField: "_id", as: "saleBranch" },
    },
    { $unwind: { path: "$saleBranch", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        date: 1, totalCost: 1, currency: 1,
        branchName: {
          $ifNull: [
            "$userBranch.name",
            { $ifNull: ["$empBranch.name", { $ifNull: ["$saleBranch.name", actualDelhiHQ?.name || "Delhi HQ"] }] }
          ]
        },
      },
    },
  ]);

  res.status(200).json({ success: true, data: rawSales });
});

// @desc    Get Branch Leaderboard
// @route   GET /api/branch-analytics/leaderboard
// @access  Private (Admin, Manager, HR)
exports.getBranchLeaderboard = asyncHandler(async (req, res, next) => {
  const dateFilter = getDateFilter(req.query);

  const salesMatch = { status: { $ne: "Cancelled" } };
  if (dateFilter) salesMatch.date = dateFilter;

  const actualDelhiHQ = (await Branch.findOne({ code: "DEL" })) || (await Branch.findOne({}));

  const rawSales = await Sale.aggregate([
    { $match: salesMatch },
    {
      $lookup: { from: "users", localField: "salesPerson", foreignField: "_id", as: "salesPersonUser" },
    },
    { $unwind: { path: "$salesPersonUser", preserveNullAndEmptyArrays: true } },
    {
      $lookup: { from: "branches", localField: "salesPersonUser.branchId", foreignField: "_id", as: "userBranch" },
    },
    { $unwind: { path: "$userBranch", preserveNullAndEmptyArrays: true } },
    {
      $lookup: { from: "employees", localField: "salesPersonUser._id", foreignField: "userId", as: "employee" },
    },
    { $unwind: { path: "$employee", preserveNullAndEmptyArrays: true } },
    {
      $lookup: { from: "branches", localField: "employee.branchId", foreignField: "_id", as: "empBranch" },
    },
    { $unwind: { path: "$empBranch", preserveNullAndEmptyArrays: true } },
    {
      $lookup: { from: "branches", localField: "branchId", foreignField: "_id", as: "saleBranch" },
    },
    { $unwind: { path: "$saleBranch", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        totalCost: 1, currency: 1,
        branchId: {
          $ifNull: [
            "$userBranch._id",
            { $ifNull: ["$empBranch._id", { $ifNull: ["$saleBranch._id", actualDelhiHQ?._id || "UNASSIGNED"] }] }
          ]
        },
        branchName: {
          $ifNull: [
            "$userBranch.name",
            { $ifNull: ["$empBranch.name", { $ifNull: ["$saleBranch.name", actualDelhiHQ?.name || "Delhi HQ"] }] }
          ]
        },
        branchCode: {
          $ifNull: [
            "$userBranch.code",
            { $ifNull: ["$empBranch.code", { $ifNull: ["$saleBranch.code", actualDelhiHQ?.code || "DEL"] }] }
          ]
        },
      },
    },
  ]);

  res.status(200).json({ success: true, data: rawSales });
});
