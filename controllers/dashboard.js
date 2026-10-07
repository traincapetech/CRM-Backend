const mongoose = require("mongoose");
const Lead = require("../models/Lead");
const Sale = require("../models/Sale");
const User = require("../models/User");
const Employee = require("../models/Employee");
const ITProject = require("../models/ITProject");
const Task = require("../models/Task");
const EmailCampaign = require("../models/EmailCampaign");
const ExchangeRate = require("../models/ExchangeRate");

// Helper to convert amounts to USD
const convertToUSD = (amount, currency = "USD", rates = {}) => {
  if (!amount || isNaN(amount)) return 0;
  const num = parseFloat(amount);
  if (currency === "USD") return num;
  const rate = rates[currency] || 1;
  return num / rate;
};

// Helper for growth calculation
const calculateGrowth = (current, previous) => {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return parseFloat((((current - previous) / previous) * 100).toFixed(1));
};

// @desc    Get optimized dashboard summary statistics
// @route   GET /api/dashboard/summary
// @access  Private
exports.getDashboardSummary = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user._id;

    // 1. Determine role-based scoping filters
    let leadFilter = {};
    let saleFilter = { status: { $ne: "Cancelled" } };

    if (userRole === "Sales Person") {
      leadFilter = { assignedTo: userId };
      saleFilter = { salesPerson: userId, status: { $ne: "Cancelled" } };
    } else if (userRole === "Lead Person") {
      leadFilter = {
        $or: [{ leadPerson: userId }, { assignedTo: userId }],
      };
      saleFilter = {
        $or: [
          { leadPerson: userId },
          { leadBy: req.user.fullName },
        ],
        status: { $ne: "Cancelled" },
      };
    } else if (userRole === "Branch Partner") {
      let branchIds = [];
      if (req.user.branchId) branchIds.push(req.user.branchId);
      if (branchIds.length === 0) {
        const emp = await Employee.findOne({ userId }).select("branchId");
        if (emp && emp.branchId) branchIds.push(emp.branchId);
      }
      if (branchIds.length > 0) {
        const branchUsers = await User.find({
          $or: [{ branchId: { $in: branchIds } }, { _id: userId }],
        }).select("_id");
        const branchUserIds = branchUsers.map((u) => u._id);
        leadFilter = {
          $or: [
            { assignedTo: { $in: branchUserIds } },
            { leadPerson: { $in: branchUserIds } },
            { createdBy: { $in: branchUserIds } },
          ],
        };
        saleFilter = {
          $or: [
            { salesPerson: { $in: branchUserIds } },
            { branchId: { $in: branchIds } },
          ],
          status: { $ne: "Cancelled" },
        };
      }
    }

    // 2. Date ranges for growth comparisons
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonthMTD = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds()
    );

    // 3. Load exchange rates
    let ratesMap = {
      USD: 1,
      EUR: 0.92,
      GBP: 0.79,
      INR: 88.02,
      CAD: 1.37,
      AUD: 1.51,
      JPY: 150.25,
      CNY: 7.15,
    };
    try {
      const er = await ExchangeRate.getOrCreateDefault();
      if (er && er.rates) {
        ratesMap = Object.fromEntries(er.rates);
      }
    } catch {
      // Use fallback
    }

    // 4. Run parallel aggregate pipelines
    const [
      leadStatsAgg,
      recentLeads,
      salesStatsAgg,
      recentSales,
      userCountsAgg,
      itProjectsAgg,
      itTasksAgg,
      emailCampaigns,
    ] = await Promise.all([
      // Lead Aggregation
      Lead.aggregate([
        { $match: leadFilter },
        {
          $facet: {
            total: [{ $count: "count" }],
            byStage: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
            thisMonth: [
              { $match: { createdAt: { $gte: startOfThisMonth, $lte: now } } },
              { $count: "count" },
            ],
            lastMonthMTD: [
              {
                $match: {
                  createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonthMTD },
                },
              },
              { $count: "count" },
            ],
          },
        },
      ]),

      // Recent 5 Leads (lean & fast)
      Lead.find(leadFilter)
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name course country status createdAt")
        .lean(),

      // Sales Aggregation
      Sale.aggregate([
        { $match: saleFilter },
        {
          $facet: {
            total: [{ $count: "count" }],
            byCurrency: [
              {
                $group: {
                  _id: {
                    currency: { $ifNull: ["$totalCostCurrency", "$currency"] },
                  },
                  totalAmount: { $sum: "$totalCost" },
                },
              },
            ],
            thisMonth: [
              { $match: { date: { $gte: startOfThisMonth, $lte: now } } },
              {
                $group: {
                  _id: { $ifNull: ["$totalCostCurrency", "$currency"] },
                  amount: { $sum: "$totalCost" },
                  count: { $sum: 1 },
                  completedCount: {
                    $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
                  },
                },
              },
            ],
            lastMonthMTD: [
              {
                $match: {
                  date: { $gte: startOfLastMonth, $lte: endOfLastMonthMTD },
                },
              },
              {
                $group: {
                  _id: { $ifNull: ["$totalCostCurrency", "$currency"] },
                  amount: { $sum: "$totalCost" },
                  count: { $sum: 1 },
                  completedCount: {
                    $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
                  },
                },
              },
            ],
            topPerformers: [
              { $match: { salesPerson: { $exists: true, $ne: null } } },
              {
                $group: {
                  _id: {
                    salesPerson: "$salesPerson",
                    currency: { $ifNull: ["$totalCostCurrency", "$currency"] },
                  },
                  salesCount: { $sum: 1 },
                  amount: { $sum: "$totalCost" },
                },
              },
            ],
          },
        },
      ]),

      // Recent 5 Sales (lean & fast)
      Sale.find(saleFilter)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("salesPerson", "fullName email")
        .select(
          "customerName course totalCost totalCostCurrency status date createdAt salesPerson"
        )
        .lean(),

      // User Counts by Role (all active users)
      User.aggregate([
        { $match: { active: true } },
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]),

      // IT Projects Aggregation
      ITProject.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),

      // IT Tasks Aggregation
      Task.aggregate([
        { $match: { department: "IT" } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),

      // Recent 5 Email Campaigns
      EmailCampaign.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name status stats createdAt")
        .lean(),
    ]);

    // 5. Process Leads results
    const leadFacet = leadStatsAgg[0] || {};
    const totalLeads = leadFacet.total?.[0]?.count || 0;
    const leadsThisMonth = leadFacet.thisMonth?.[0]?.count || 0;
    const leadsLastMonthMTD = leadFacet.lastMonthMTD?.[0]?.count || 0;

    const leadStages = {
      Introduction: 0,
      Acknowledgement: 0,
      Question: 0,
      "Future Promise": 0,
      Payment: 0,
      Analysis: 0,
    };
    (leadFacet.byStage || []).forEach((st) => {
      const stageName = st._id || "Unknown";
      leadStages[stageName] = st.count;
    });

    // 6. Process Sales results & convert currency to USD
    const saleFacet = salesStatsAgg[0] || {};
    const totalSales = saleFacet.total?.[0]?.count || 0;

    let totalRevenue = 0;
    (saleFacet.byCurrency || []).forEach((c) => {
      const curr = c._id?.currency || "USD";
      totalRevenue += convertToUSD(c.totalAmount, curr, ratesMap);
    });

    let salesThisMonthCount = 0;
    let salesThisMonthCompleted = 0;
    let revenueThisMonth = 0;
    (saleFacet.thisMonth || []).forEach((item) => {
      salesThisMonthCount += item.count;
      salesThisMonthCompleted += item.completedCount;
      revenueThisMonth += convertToUSD(item.amount, item._id || "USD", ratesMap);
    });

    let salesLastMonthCount = 0;
    let salesLastMonthCompleted = 0;
    let revenueLastMonth = 0;
    (saleFacet.lastMonthMTD || []).forEach((item) => {
      salesLastMonthCount += item.count;
      salesLastMonthCompleted += item.completedCount;
      revenueLastMonth += convertToUSD(item.amount, item._id || "USD", ratesMap);
    });

    // Process Top Performers
    const performerMap = {};
    for (const item of saleFacet.topPerformers || []) {
      const spId = item._id.salesPerson.toString();
      const curr = item._id.currency || "USD";
      const usdRev = convertToUSD(item.amount, curr, ratesMap);

      if (!performerMap[spId]) {
        performerMap[spId] = {
          id: spId,
          salesCount: 0,
          revenue: 0,
        };
      }
      performerMap[spId].salesCount += item.salesCount;
      performerMap[spId].revenue += usdRev;
    }

    // Populate performer user names
    const topPerformerIds = Object.keys(performerMap);
    if (topPerformerIds.length > 0) {
      const performerUsers = await User.find({
        _id: { $in: topPerformerIds },
      })
        .select("_id fullName")
        .lean();

      performerUsers.forEach((u) => {
        const p = performerMap[u._id.toString()];
        if (p) p.name = u.fullName;
      });
    }

    const topPerformers = Object.values(performerMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // 7. Process User counts
    const userCounts = {
      salesPerson: 0,
      leadPerson: 0,
      manager: 0,
      admin: 0,
      itManager: 0,
      itIntern: 0,
      itPermanent: 0,
    };
    let totalUsers = 0;
    userCountsAgg.forEach((u) => {
      totalUsers += u.count;
      const role = u._id;
      if (role === "Sales Person") userCounts.salesPerson += u.count;
      else if (role === "Lead Person") userCounts.leadPerson += u.count;
      else if (role === "Manager") userCounts.manager += u.count;
      else if (role === "Admin") userCounts.admin += u.count;
      else if (role === "IT Manager") userCounts.itManager += u.count;
      else if (role === "IT Intern") userCounts.itIntern += u.count;
      else if (role === "IT Permanent") userCounts.itPermanent += u.count;
    });

    // 8. Process IT Stats
    const itProjectsMap = {};
    let totalProjects = 0;
    itProjectsAgg.forEach((p) => {
      itProjectsMap[p._id] = p.count;
      totalProjects += p.count;
    });

    const itTasksMap = {};
    let totalTasks = 0;
    itTasksAgg.forEach((t) => {
      itTasksMap[t._id] = t.count;
      totalTasks += t.count;
    });

    const itStats = {
      itManager: userCounts.itManager,
      itIntern: userCounts.itIntern,
      itPermanent: userCounts.itPermanent,
      totalProjects,
      activeProjects: itProjectsMap["ACTIVE"] || 0,
      completedProjects: itProjectsMap["COMPLETED"] || 0,
      totalTasks,
      pendingTasks:
        (itTasksMap["Pending"] || 0) + (itTasksMap["In Progress"] || 0),
      completedTasks:
        (itTasksMap["Manager Confirmed"] || 0) +
        (itTasksMap["Employee Completed"] || 0),
    };

    // 9. Process Email Campaign Stats
    const emailStats = emailCampaigns.reduce(
      (acc, c) => {
        if (c.status === "sent" || c.status === "sending") {
          acc.totalSent += c.stats?.sent || 0;
          acc.totalOpened += c.stats?.opened || 0;
          acc.totalClicked += c.stats?.clicked || 0;
          acc.totalDelivered += c.stats?.delivered || 0;
        }
        return acc;
      },
      { totalSent: 0, totalOpened: 0, totalClicked: 0, totalDelivered: 0 }
    );

    // 10. Growth calculations
    const convThisMonth =
      leadsThisMonth > 0
        ? (salesThisMonthCompleted / leadsThisMonth) * 100
        : 0;
    const convLastMonthMTD =
      leadsLastMonthMTD > 0
        ? (salesLastMonthCompleted / leadsLastMonthMTD) * 100
        : 0;

    const growth = {
      leads: {
        percent: calculateGrowth(leadsThisMonth, leadsLastMonthMTD),
        isIncrease: leadsThisMonth >= leadsLastMonthMTD,
      },
      sales: {
        percent: calculateGrowth(salesThisMonthCount, salesLastMonthCount),
        isIncrease: salesThisMonthCount >= salesLastMonthCount,
      },
      revenue: {
        percent: calculateGrowth(revenueThisMonth, revenueLastMonth),
        isIncrease: revenueThisMonth >= revenueLastMonth,
      },
      conversion: {
        percent: calculateGrowth(convThisMonth, convLastMonthMTD),
        isIncrease: convThisMonth >= convLastMonthMTD,
      },
    };

    const dashboardSummary = {
      totalLeads,
      totalSales,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalUsers,
      recentLeads,
      recentSales,
      userCounts,
      itStats,
      leadStages,
      topPerformers,
      emailStats,
      recentCampaigns: emailCampaigns,
      growth,
    };

    return res.status(200).json({
      success: true,
      data: dashboardSummary,
    });
  } catch (error) {
    console.error("Dashboard summary error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate dashboard summary",
      error: error.message,
    });
  }
};
