const KPIDefinition = require("../models/KPIDefinition");
const EmployeeTarget = require("../models/EmployeeTarget");
const DailyPerformanceRecord = require("../models/DailyPerformanceRecord");
const PerformanceSummary = require("../models/PerformanceSummary");
const User = require("../models/User");
const Lead = require("../models/Lead");
const Sale = require("../models/Sale");
const PerformanceCalculationService = require("../services/performanceCalculation");

// @desc    Get all KPI templates
// @route   GET /api/performance/kpis
// @access  Private (Admin, HR, Manager)
const getKPITemplates = async (req, res) => {
  try {
    const { role, isActive } = req.query;

    const query = {};
    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === "true";

    const kpis = await KPIDefinition.find(query)
      .populate("createdBy", "fullName email")
      .sort({ role: 1, weight: -1 });

    res.status(200).json({
      success: true,
      count: kpis.length,
      data: kpis,
    });
  } catch (error) {
    console.error("Error fetching KPI templates:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching KPI templates",
      error: error.message,
    });
  }
};

// @desc    Create new KPI template
// @route   POST /api/performance/kpis
// @access  Private (Admin, HR)
const createKPITemplate = async (req, res) => {
  try {
    const kpiData = {
      ...req.body,
      createdBy: req.user._id,
    };

    const kpi = await KPIDefinition.create(kpiData);

    res.status(201).json({
      success: true,
      message: "KPI template created successfully",
      data: kpi,
    });
  } catch (error) {
    console.error("Error creating KPI template:", error);
    res.status(500).json({
      success: false,
      message: "Error creating KPI template",
      error: error.message,
    });
  }
};

// @desc    Get single KPI template
// @route   GET /api/performance/kpis/:id
// @access  Private
const getKPITemplate = async (req, res) => {
  try {
    const kpi = await KPIDefinition.findById(req.params.id).populate(
      "createdBy",
      "fullName email",
    );

    if (!kpi) {
      return res.status(404).json({
        success: false,
        message: "KPI template not found",
      });
    }

    res.status(200).json({
      success: true,
      data: kpi,
    });
  } catch (error) {
    console.error("Error fetching KPI template:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching KPI template",
      error: error.message,
    });
  }
};

// @desc    Update KPI template
// @route   PUT /api/performance/kpis/:id
// @access  Private (Admin, HR)
const updateKPITemplate = async (req, res) => {
  try {
    const kpi = await KPIDefinition.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!kpi) {
      return res.status(404).json({
        success: false,
        message: "KPI template not found",
      });
    }

    // Propagate updated thresholds/weight to all active EmployeeTargets for this KPI for the current month
    const syncCount = await PerformanceCalculationService.syncActiveTargets(kpi._id);
    console.log(`✅ Synced update to ${syncCount} employee targets.`);

    // Recalculate performance for all affected employees for today
    const now = new Date();
    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    
    const affectedTargets = await EmployeeTarget.find({
      kpiId: kpi._id,
      "period.periodKey": periodKey
    }).select("employeeId");

    const uniqueEmployeeIds = [
      ...new Set(affectedTargets.map((t) => t.employeeId.toString())),
    ];

    if (uniqueEmployeeIds.length > 0) {
      console.log(`🔄 Triggering performance recalculation for ${uniqueEmployeeIds.length} employees...`);
      const { queuePerformanceCalculation } = require("../services/performanceQueue");
      for (const empId of uniqueEmployeeIds) {
        try {
          await queuePerformanceCalculation(empId, now);
        } catch (calcErr) {
          console.error(`Error recalculating for ${empId}:`, calcErr.message);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `KPI template updated successfully. ${uniqueEmployeeIds.length} employee(s) recalculated.`,
      data: kpi,
    });
  } catch (error) {
    console.error("Error updating KPI template:", error);
    res.status(500).json({
      success: false,
      message: "Error updating KPI template",
      error: error.message,
    });
  }
};

// @desc    Delete KPI template
// @route   DELETE /api/performance/kpis/:id
// @access  Private (Admin, HR)
const deleteKPITemplate = async (req, res) => {
  try {
    const kpi = await KPIDefinition.findById(req.params.id);

    if (!kpi) {
      return res.status(404).json({
        success: false,
        message: "KPI template not found",
      });
    }

    // Instead of hard delete, perform hard delete and clean up targets
    await KPIDefinition.findByIdAndDelete(req.params.id);

    // Also delete associated targets to prevent ghost data
    const EmployeeTarget = require("../models/EmployeeTarget");
    await EmployeeTarget.deleteMany({ kpiId: req.params.id });

    res.status(200).json({
      success: true,
      message: "KPI template deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting KPI template:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting KPI template",
      error: error.message,
    });
  }
};

// @desc    Assign KPI to employees
// @route   POST /api/performance/kpis/:id/assign
// @access  Private (Admin, HR, Manager)
const assignKPIToEmployees = async (req, res) => {
  try {
    const { employeeIds, period } = req.body;
    const kpiId = req.params.id;

    // Validate KPI exists
    const kpi = await KPIDefinition.findById(kpiId);
    if (!kpi) {
      return res.status(404).json({
        success: false,
        message: "KPI template not found",
      });
    }

    // Auto-fill period endDate if missing based on frequency
    let endDate = period.endDate;
    if (!endDate) {
      const start = new Date(period.startDate);
      if (kpi.frequency === "daily") {
        endDate = start.toISOString().split("T")[0];
      } else if (kpi.frequency === "weekly") {
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        endDate = end.toISOString().split("T")[0];
      } else if (kpi.frequency === "monthly") {
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        endDate = end.toISOString().split("T")[0];
      } else if (kpi.frequency === "quarterly") {
        const quarter = Math.floor(start.getMonth() / 3);
        const end = new Date(start.getFullYear(), quarter * 3 + 3, 0);
        endDate = end.toISOString().split("T")[0];
      } else {
        // Fallback: end of current month
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        endDate = end.toISOString().split("T")[0];
      }
    }

    // Auto-fill periodKey if missing
    let periodKey = period.periodKey;
    if (!periodKey) {
      const start = new Date(period.startDate);
      if (kpi.frequency === "daily") {
        periodKey = period.startDate;
      } else if (kpi.frequency === "weekly") {
        periodKey = `${period.startDate}-W`;
      } else if (kpi.frequency === "monthly") {
        periodKey = period.startDate.substring(0, 7);
      } else if (kpi.frequency === "quarterly") {
        const quarter = Math.floor(start.getMonth() / 3) + 1;
        periodKey = `${start.getFullYear()}-Q${quarter}`;
      }
    }

    // Create targets for each employee
    const assignedTargets = [];
    for (const employeeId of employeeIds) {
      // Use custom targets if provided in request, otherwise use KPI defaults
      const targetValues = req.body.targets || {
        minimum: kpi.thresholds.minimum,
        target: kpi.thresholds.target,
        excellent: kpi.thresholds.excellent,
      };

      const targetData = {
        employeeId,
        kpiId,
        period: {
          startDate: period.startDate,
          endDate,
          periodKey,
        },
        targets: targetValues,
        leadDailyTarget: req.body.leadDailyTarget || kpi.thresholds.leadDailyTarget,
        leadMinimumDailyTarget: req.body.leadMinimumDailyTarget || kpi.thresholds.leadMinimumDailyTarget,
        monthlySalesTarget: req.body.monthlySalesTarget || kpi.thresholds.monthlySalesTarget,
      };

      // Use upsert to avoid duplicates
      const target = await EmployeeTarget.findOneAndUpdate(
        {
          employeeId,
          kpiId,
          "period.periodKey": periodKey,
        },
        targetData,
        {
          upsert: true,
          new: true,
        },
      );

      assignedTargets.push(target);
    }

    const { queuePerformanceCalculation } = require("../services/performanceQueue");
    const today = new Date();
    for (const employeeId of employeeIds) {
      try {
        await queuePerformanceCalculation(
          employeeId,
          today,
        );
      } catch (calcErr) {
        console.error(
          `Error recalculating for ${employeeId}:`,
          calcErr.message,
        );
      }
    }

    res.status(201).json({
      success: true,
      message: `KPI assigned to ${assignedTargets.length} employee(s) and performance recalculated`,
      data: assignedTargets,
    });
  } catch (error) {
    console.error("Error assigning KPI:", error);
    res.status(500).json({
      success: false,
      message: "Error assigning KPI to employees",
      error: error.message,
    });
  }
};

// @desc    Get employee performance summary
// @route   GET /api/performance/employee/:id
// @access  Private
const getEmployeePerformance = async (req, res) => {
  try {
    const employeeId = req.params.id;
    const { month, year } = req.query;

    const PerformanceCalculationService = require("../services/performanceCalculation");
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Check if we are requesting current or historical data
    const isHistorical =
      year && month && (parseInt(year) < currentYear || (parseInt(year) === currentYear && parseInt(month) < currentMonth));

    if (isHistorical) {
      const targetMonth = parseInt(month);
      const targetYear = parseInt(year);
      const periodKey = `${targetYear}-${targetMonth.toString().padStart(2, "0")}`;

      // 1. Fetch from MonthlyPerformanceRecord (Archived Data)
      const MonthlyPerformanceRecord = require("../models/MonthlyPerformanceRecord");
      const archivedRecord = await MonthlyPerformanceRecord.findOne({
        employeeId,
        periodKey,
      });

      if (archivedRecord) {
        const records = await DailyPerformanceRecord.find({
          employeeId,
          date: {
            $gte: new Date(targetYear, targetMonth - 1, 1),
            $lte: new Date(targetYear, targetMonth, 0, 23, 59, 59, 999),
          },
        }).sort({ date: -1 });

        return res.status(200).json({
          success: true,
          data: {
            summary: archivedRecord,
            targets: [
              {
                kpiName:
                  archivedRecord.role === "Lead Person"
                    ? "Leads Generated"
                    : "Sales Closed",
                actual:
                  archivedRecord.role === "Lead Person"
                    ? archivedRecord.actualLeads
                    : archivedRecord.actualSales,
                target:
                  archivedRecord.role === "Lead Person"
                    ? archivedRecord.targetLeads
                    : archivedRecord.targetSales,
                score: archivedRecord.monthlyScore,
                status: archivedRecord.ratingTier,
              },
            ],
            recentRecords: records,
            isHistorical: true,
          },
        });
      }

      // 2. Fallback to aggregation if no archived record exists yet
      const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
      const endOfMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

      const records = await DailyPerformanceRecord.find({
        employeeId,
        date: { $gte: startOfMonth, $lte: endOfMonth },
      }).sort({ date: 1 });

      if (records.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            summary: {
              employeeId: await User.findById(employeeId).select(
                "fullName email role",
              ),
              currentRating: 0,
              ratingTier: "N/A",
              stars: 0,
              isHistorical: true,
              month: targetMonth,
              year: targetYear,
            },
            targets: [],
            recentRecords: [],
          },
        });
      }

      const totalScore = records.reduce((sum, r) => sum + r.overallScore, 0);
      const workingDays = await PerformanceCalculationService.getWorkingDaysInMonth(
        targetYear,
        targetMonth,
        "Lead Person",
      ); // Approximate role
      const avgScore =
        workingDays > 0 ? parseFloat((totalScore / workingDays).toFixed(2)) : 0;

      const currentStats = await PerformanceSummary.findOne({ employeeId });

      const summary = {
        employeeId: await User.findById(employeeId).select(
          "fullName email role",
        ),
        currentRating: avgScore,
        ratingTier: PerformanceCalculationService.getRatingTier(avgScore),
        stars: PerformanceCalculationService.getStars(avgScore),
        isHistorical: true,
        month: targetMonth,
        year: targetYear,
        lastCalculated: records[records.length - 1].calculatedAt,
        averages: {
          ...(currentStats?.averages?.toObject
            ? currentStats.averages.toObject()
            : currentStats?.averages || {}),
          thisMonth: avgScore,
        },
      };

      return res.status(200).json({
        success: true,
        data: {
          summary,
          targets: [],
          recentRecords: records.reverse(),
        },
      });
    }

    // --- CURRENT MONTH LOGIC (Existing) ---
    // Get performance summary
    let summary = await PerformanceSummary.findOne({ employeeId }).populate(
      "employeeId",
      "fullName email role",
    );

    // If no summary exists, calculate performance for today to generate one in background
    if (!summary) {
      console.log(
        `No summary for ${employeeId}, triggering initial calculation in background...`,
      );
      const today = new Date();
      const { queuePerformanceCalculation } = require("../services/performanceQueue");
      queuePerformanceCalculation(employeeId, today).catch(err => {
        console.error("Async performance calculation error:", err);
      });

      // Create fallback summary immediately so the page doesn't block
      summary = await PerformanceSummary.create({
        employeeId,
        currentRating: 0,
        ratingTier: "N/A",
        stars: 0,
      });
      summary = await summary.populate("employeeId", "fullName email role");
    }

    // Get current active targets
    const rawTargets = await EmployeeTarget.find({ employeeId })
      .populate("kpiId")
      .sort({ "period.startDate": -1 })
      .limit(20); 

    // Deduplicate: Keep only the latest target per KPI
    const uniqueTargetsMap = new Map();
    rawTargets.forEach((t) => {
      if (t.kpiId && summary.employeeId && t.kpiId.role === summary.employeeId.role) {
        const kpiId = t.kpiId._id.toString();
        if (!uniqueTargetsMap.has(kpiId)) {
          uniqueTargetsMap.set(kpiId, t);
        }
      }
    });
    const targets = Array.from(uniqueTargetsMap.values());

    // Get recent performance records (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentRecords = await DailyPerformanceRecord.find({
      employeeId,
      date: { $gte: thirtyDaysAgo },
    })
      .sort({ date: -1 })
      .limit(35);

    // MERGE ACTUALS: Inject today's/latest actuals into static targets
    const latestRecord = recentRecords.length > 0 ? recentRecords[0] : null;

    const kpiScoreMap = {};
    if (latestRecord && latestRecord.kpiScores) {
      latestRecord.kpiScores.forEach((score) => {
        // Match by ID primarily, fallback to Name
        const key = score.kpiId ? score.kpiId.toString() : score.kpiName;
        kpiScoreMap[key] = score;
      });
    }

    let salesRes = null;
    if (summary && summary.employeeId && summary.employeeId.role === "Sales Person") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      salesRes = await PerformanceCalculationService.calculateSales(employeeId, startOfMonth, "custom", now);
    }

    const enrichedTargets = targets.map((t) => {
      const tObj = t.toObject();
      const kpiId = t.kpiId._id.toString();
      const kpiName = t.kpiId.kpiName;

      // Try to find daily score by ID first, then by Name
      const score = kpiScoreMap[kpiId] || kpiScoreMap[kpiName];

      if (score) {
        if (summary.employeeId.role === "Sales Person") {
          // For Sales Persons, show collective monthly actuals as per user request
          tObj.actual = salesRes ? salesRes.count : 0;
          tObj.baseTarget = t.monthlySalesTarget || t.targets?.target || 0;
          tObj.score = tObj.baseTarget > 0 ? (tObj.actual / tObj.baseTarget) * 100 : 0;
          tObj.status = PerformanceCalculationService.getRatingTier(tObj.score);
        } else {
          // For Leads, keep daily view as per user request
          tObj.actual = score.actual;
          tObj.score = score.score;
          tObj.status = score.status;
          tObj.baseTarget = score.target; // Maps to 'target' in the modal
        }
      }

      // Ensure target fields are present in the response
      tObj.leadDailyTarget = t.leadDailyTarget;
      tObj.leadMinimumDailyTarget = t.leadMinimumDailyTarget;
      tObj.monthlySalesTarget = t.monthlySalesTarget;

      return tObj;
    });

    // Calculate rolling averages on the fly as per user request
    const averages = await PerformanceCalculationService.getRollingAverages(employeeId);

    // Merge averages into summary for the frontend
    const summaryWithAverages = summary.toObject ? summary.toObject() : { ...summary };
    summaryWithAverages.averages = averages;

    res.status(200).json({
      success: true,
      data: {
        summary: summaryWithAverages,
        targets: enrichedTargets,
        recentRecords,
      },
    });
  } catch (error) {
    console.error("Error fetching employee performance:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching employee performance",
      error: error.message,
    });
  }
};

// @desc    Get employee daily performance breakdown
// @route   GET /api/performance/employee/:id/daily
// @access  Private
const getEmployeeDailyPerformance = async (req, res) => {
  try {
    const employeeId = req.params.id;
    const { startDate, endDate, limit = 30 } = req.query;

    const query = { employeeId };

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const records = await DailyPerformanceRecord.find(query)
      .sort({ date: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error) {
    console.error("Error fetching daily performance:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching daily performance",
      error: error.message,
    });
  }
};

// @desc    Get team performance  (for managers)
// @route   GET /api/performance/team/:managerId
// @access  Private (Manager, Admin, HR)
const getTeamPerformance = async (req, res) => {
  try {
    const managerId = req.params.managerId;

    // Find all active Sales and Lead persons (global average as per user request)
    const teamMembers = await User.find({
      role: { $in: ["Sales Person", "Lead Person"] },
      active: true,
    }).select("fullName email role");

    const teamMemberIds = teamMembers.map((m) => m._id);

    // Get performance summaries for team
    const summaries = await PerformanceSummary.find({
      employeeId: { $in: teamMemberIds },
    }).populate("employeeId", "fullName email role");

    // Calculate team stats
    const teamStats = {
      totalMembers: teamMembers.length,
      avgRating: 0,
      atRiskCount: 0,
      topPerformers: [],
      bottomPerformers: [],
      distribution: {
        excellent: 0,
        good: 0,
        average: 0,
        "below-average": 0,
        poor: 0,
      },
    };

    if (summaries.length > 0) {
      let totalRating = 0;
      summaries.forEach((summary) => {
        totalRating += summary.currentRating || 0;
        if (summary.ratingTier && teamStats.distribution[summary.ratingTier] !== undefined) {
          teamStats.distribution[summary.ratingTier] += 1;
        }

        if ((summary.currentRating || 0) < 50) {
          teamStats.atRiskCount += 1;
        }
      });

      teamStats.avgRating = parseFloat((totalRating / summaries.length).toFixed(2));
    }

    // Sort by rating
    const sorted = [...summaries].sort(
      (a, b) => (b.currentRating || 0) - (a.currentRating || 0),
    );
    teamStats.topPerformers = sorted.slice(0, 5);
    teamStats.bottomPerformers = sorted.slice(-5).reverse();

    res.status(200).json({
      success: true,
      data: {
        teamStats,
        teamMembers: summaries,
      },
    });
  } catch (error) {
    console.error("Error fetching team performance:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching team performance",
      error: error.message,
    });
  }
};

// @desc    Get all employees assigned to a specific KPI (grouped by employee)
// @route   GET /api/performance/kpis/:id/assignments
// @access  Private (Admin, HR, Manager)
const getKPIAssignments = async (req, res) => {
  try {
    const kpiId = req.params.id;

    // Find all targets for this KPI and use lean() for faster, cleaner object handling
    const rawAssignments = await EmployeeTarget.find({ kpiId })
      .populate("employeeId", "fullName email role active")
      .sort({ "period.startDate": -1 })
      .lean();

    // Group by employee to avoid duplicates in management view
    const groupedMap = new Map();
    
    rawAssignments.forEach(item => {
      // If populate failed or user was deleted, employeeId might be null or just a string ID
      const employee = item.employeeId;
      if (!employee || typeof employee === "string") return; 
      
      const userId = employee._id.toString();
      if (!groupedMap.has(userId)) {
        groupedMap.set(userId, {
          employee: employee,
          latestPeriod: item.period?.periodKey,
          totalAssignments: 0,
          assignmentIds: [],
          allPeriods: []
        });
      }
      
      const group = groupedMap.get(userId);
      group.totalAssignments += 1;
      group.assignmentIds.push(item._id);
      group.allPeriods.push(item.period?.periodKey);
    });

    const data = Array.from(groupedMap.values());

    res.status(200).json({
      success: true,
      count: data.length,
      data: data,
    });
  } catch (error) {
    console.error("Error fetching KPI assignments:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching KPI assignments",
      error: error.message,
    });
  }
};

// @desc    Remove a KPI assignment from an employee
// @route   DELETE /api/performance/kpis/:kpiId/assignments/:targetId
// @access  Private (Admin, HR)
const unassignKPIFromEmployee = async (req, res) => {
  try {
    const { kpiId, targetId } = req.params;
    const { employeeId: bodyEmployeeId, deleteAll } = req.query; // Optional query params for bulk removal

    if (deleteAll === "true" && bodyEmployeeId) {
      // Remove all assignments for this employee from this KPI
      await EmployeeTarget.deleteMany({ kpiId, employeeId: bodyEmployeeId });
      
      // Trigger recalculation
      const { queuePerformanceCalculation } = require("../services/performanceQueue");
      await queuePerformanceCalculation(bodyEmployeeId, new Date());

      return res.status(200).json({
        success: true,
        message: "All assignments removed for employee",
      });
    }

    const target = await EmployeeTarget.findOne({ _id: targetId, kpiId });
    if (!target) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    const employeeId = target.employeeId;
    await EmployeeTarget.findByIdAndDelete(targetId);

    // Trigger recalculation
    const { queuePerformanceCalculation } = require("../services/performanceQueue");
    await queuePerformanceCalculation(employeeId, new Date());

    res.status(200).json({
      success: true,
      message: "KPI assignment removed and performance updated",
    });
  } catch (error) {
    console.error("Error removing KPI assignment:", error);
    res.status(500).json({
      success: false,
      message: "Error removing KPI assignment",
      error: error.message,
    });
  }
};

module.exports = {
  getKPITemplates,
  createKPITemplate,
  getKPITemplate,
  updateKPITemplate,
  deleteKPITemplate,
  assignKPIToEmployees,
  getEmployeePerformance,
  getEmployeeDailyPerformance,
  getTeamPerformance,
  getKPIAssignments,
  unassignKPIFromEmployee,
};
