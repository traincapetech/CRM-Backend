const KPIDefinition = require("../models/KPIDefinition");
const EmployeeTarget = require("../models/EmployeeTarget");
const DailyPerformanceRecord = require("../models/DailyPerformanceRecord");
const PerformanceSummary = require("../models/PerformanceSummary");
const User = require("../models/User");
const Lead = require("../models/Lead");
const Sale = require("../models/Sale");

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

    res.status(200).json({
      success: true,
      message: "KPI template updated successfully",
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

    // Instead of hard delete, soft delete by setting isActive to false
    kpi.isActive = false;
    await kpi.save();

    res.status(200).json({
      success: true,
      message: "KPI template deactivated successfully",
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

    // Create targets for each employee
    const targets = [];
    for (const employeeId of employeeIds) {
      const targetData = {
        employeeId,
        kpiId,
        period: {
          startDate: period.startDate,
          endDate: period.endDate,
          periodKey: period.periodKey, // e.g., "2025-02" for monthly
        },
        targets: {
          minimum: kpi.thresholds.minimum,
          target: kpi.thresholds.target,
          excellent: kpi.thresholds.excellent,
        },
      };

      // Use upsert to avoid duplicates
      const target = await EmployeeTarget.findOneAndUpdate(
        {
          employeeId,
          kpiId,
          "period.periodKey": period.periodKey,
        },
        targetData,
        {
          upsert: true,
          new: true,
        },
      );

      targets.push(target);
    }

    res.status(201).json({
      success: true,
      message: `KPI assigned to ${targets.length} employee(s)`,
      data: targets,
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

    // Get performance summary
    let summary = await PerformanceSummary.findOne({ employeeId }).populate(
      "employeeId",
      "fullName email role",
    );

    // If no summary exists, calculate performance for today to generate one
    if (!summary) {
      console.log(
        `No summary for ${employeeId}, triggering initial calculation...`,
      );
      const PerformanceCalculationService = require("../services/performanceCalculation");
      const today = new Date();
      await PerformanceCalculationService.calculateEmployeePerformance(
        employeeId,
        today,
      );

      // Fetch again after calculation
      summary = await PerformanceSummary.findOne({ employeeId }).populate(
        "employeeId",
        "fullName email role",
      );

      // If still no summary (e.g. no KPIs), create empty one with 0 stars
      if (!summary) {
        summary = await PerformanceSummary.create({
          employeeId,
          currentRating: 0,
          ratingTier: "N/A",
          stars: 0,
        });
        summary = await summary.populate("employeeId", "fullName email role");
      }
    }

    // Get current active targets
    const targets = await EmployeeTarget.find({ employeeId })
      .populate("kpiId")
      .sort({ "period.startDate": -1 })
      .limit(10);

    // Get recent performance records (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentRecords = await DailyPerformanceRecord.find({
      employeeId,
      date: { $gte: thirtyDaysAgo },
    })
      .sort({ date: -1 })
      .limit(30);

    res.status(200).json({
      success: true,
      data: {
        summary,
        targets,
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

    // Find all employees reporting to this manager
    // Note: You'll need to add a "managerId" field to User model
    const teamMembers = await User.find({
      // managerId: managerId, // Uncomment when you add this field
      role: { $in: ["Sales Person", "Lead Person"] }, // Temporary filter
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
        belowAverage: 0,
        poor: 0,
      },
    };

    summaries.forEach((summary) => {
      teamStats.avgRating += summary.currentRating;
      teamStats.distribution[summary.ratingTier] += 1;

      if (summary.currentRating < 50) {
        teamStats.atRiskCount += 1;
      }
    });

    teamStats.avgRating = teamStats.avgRating / summaries.length || 0;

    // Sort by rating
    const sorted = [...summaries].sort(
      (a, b) => b.currentRating - a.currentRating,
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

// @desc    Trigger manual performance calculation for today
// @route   POST /api/performance/employee/:id/calculate
// @access  Private
const calculateEmployeePerformanceToday = async (req, res) => {
  try {
    const employeeId = req.params.id;
    const PerformanceCalculationService = require("../services/performanceCalculation");

    // Calculate for today
    const today = new Date();
    const result =
      await PerformanceCalculationService.calculateEmployeePerformance(
        employeeId,
        today,
      );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Calculation failed or no KPIs found for employee",
      });
    }

    res.status(200).json({
      success: true,
      message: "Performance calculated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error calculating performance:", error);
    res.status(500).json({
      success: false,
      message: "Error calculating performance",
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
  calculateEmployeePerformanceToday,
};
