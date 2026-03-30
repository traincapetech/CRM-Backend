const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const PerformanceCronJobs = require("../services/performanceCronJobs");
const { seedKPIs } = require("../seeds/kpiSeeds");

/**
 * Manual triggers for testing/admin purposes
 */

// @desc    Manually trigger performance calculation
// @route   POST /api/performance/admin/calculate
// @access  Private (Admin, HR)
router.post(
  "/admin/calculate",
  protect,
  authorize("Admin", "HR"),
  async (req, res) => {
    try {
      const { date } = req.body; // Optional: specific date
      const result = await PerformanceCronJobs.runManualCalculation(
        date ? new Date(date) : null,
      );

      res.status(200).json({
        success: true,
        message: "Performance calculation completed",
        data: result,
      });
    } catch (error) {
      console.error("Error in manual calculation:", error);
      res.status(500).json({
        success: false,
        message: "Error running performance calculation",
        error: error.message,
      });
    }
  },
);

// @desc    Manually trigger PIP check
// @route   POST /api/performance/admin/pip-check
// @access  Private (Admin, HR)
router.post(
  "/admin/pip-check",
  protect,
  authorize("Admin", "HR"),
  async (req, res) => {
    try {
      const result = await PerformanceCronJobs.runManualPIPCheck();

      res.status(200).json({
        success: true,
        message: "PIP check completed",
        data: result,
      });
    } catch (error) {
      console.error("Error in manual PIP check:", error);
      res.status(500).json({
        success: false,
        message: "Error running PIP check",
        error: error.message,
      });
    }
  },
);

// @desc    Seed default KPI templates
// @route   POST /api/performance/admin/seed-kpis
// @access  Private (Admin)
router.post(
  "/admin/seed-kpis",
  protect,
  authorize("Admin"),
  async (req, res) => {
    try {
      await seedKPIs();

      res.status(200).json({
        success: true,
        message: "Default KPI templates seeded successfully",
      });
    } catch (error) {
      console.error("Error seeding KPIs:", error);
      res.status(500).json({
        success: false,
        message: "Error seeding KPIs",
        error: error.message,
      });
    }
  },
);

// @desc    Set custom target for an employee
// @route   POST /api/performance/admin/set-target
// @access  Private (Admin, HR)
router.post(
  "/admin/set-target",
  protect,
  authorize("Admin", "HR"),
  async (req, res) => {
    try {
      const {
        employeeId,
        year,
        month,
        leadDailyTarget,
        leadMinimumDailyTarget,
        monthlySalesTarget,
      } = req.body;

      if (!employeeId || !year || !month) {
        return res.status(400).json({
          success: false,
          message: "employeeId, year, and month are required",
        });
      }

      const periodKey = `${year}-${month.toString().padStart(2, "0")}`;
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      const target = await require("../models/EmployeeTarget").findOneAndUpdate(
        { employeeId, "period.periodKey": periodKey },
        {
          employeeId,
          period: {
            startDate,
            endDate,
            periodKey,
          },
          leadDailyTarget,
          leadMinimumDailyTarget,
          monthlySalesTarget,
          updatedAt: new Date(),
        },
        { upsert: true, new: true },
      );

      res.status(200).json({
        success: true,
        message: "Target set successfully",
        data: target,
      });
    } catch (error) {
      console.error("Error setting target:", error);
      res.status(500).json({
        success: false,
        message: "Error setting target",
        error: error.message,
      });
    }
  },
);

// @desc    Finalize performance for a month
// @route   POST /api/performance/admin/finalize-month
// @access  Private (Admin, HR)
router.post(
  "/admin/finalize-month",
  protect,
  authorize("Admin", "HR"),
  async (req, res) => {
    try {
      const { year, month } = req.body;
      const PerformanceCalculationService = require("../services/performanceCalculation");
      const User = require("../models/User");

      if (!year || !month) {
        return res.status(400).json({
          success: false,
          message: "year and month are required",
        });
      }

      const employees = await User.find({
        active: true,
        role: { $in: ["Lead Person", "Sales Person"] },
      });

      const results = [];
      for (const emp of employees) {
        const record = await PerformanceCalculationService.finalizeMonthlyRecord(
          emp._id,
          year,
          month,
        );
        results.push({ employeeId: emp._id, fullName: emp.fullName, success: !!record });
      }

      res.status(200).json({
        success: true,
        message: `Monthly finalization complete for ${results.length} employees`,
        data: results,
      });
    } catch (error) {
      console.error("Error finalizing month:", error);
      res.status(500).json({
        success: false,
        message: "Error finalizing month",
        error: error.message,
      });
    }
  },
);

// @desc    Get all employee performance summaries
// @route   GET /api/performance/admin/all-employees
// @access  Private (Admin, HR)
router.get(
  "/admin/all-employees",
  protect,
  authorize("Admin", "HR", "Manager"),
  async (req, res) => {
    try {
      const PerformanceSummary = require("../models/PerformanceSummary");
      const DailyPerformanceRecord = require("../models/DailyPerformanceRecord");
      const User = require("../models/User");
      const PerformanceCalculationService = require("../services/performanceCalculation");

      const { month, year } = req.query;
      const now = new Date();
      const currentMonth = now.getMonth() + 1; // 1-12
      const currentYear = now.getFullYear();

      const isHistorical =
        (year && parseInt(year) < currentYear) ||
        (year &&
          parseInt(year) === currentYear &&
          month &&
          parseInt(month) < currentMonth);

      const KPIService = require("../services/kpiService");

      if (!isHistorical) {
        // --- CURRENT MONTH LOGIC (Default) ---
        // Ensure all active employees with KPI-eligible roles have fresh calculations
        const eligibleEmployees = await User.find({
          active: true,
          role: { $in: ["Lead Person", "Sales Person", "Manager"] },
        }).select("_id fullName role");

        const today = new Date();
        for (const emp of eligibleEmployees) {
          try {
            await PerformanceCalculationService.calculateEmployeePerformance(
              emp._id,
              today,
            );
          } catch (calcErr) {
            // If calculation fails, ensure at least a summary exists
            const existingSummary = await PerformanceSummary.findOne({
              employeeId: emp._id,
            });
            if (!existingSummary) {
              await PerformanceSummary.create({
                employeeId: emp._id,
                currentRating: 0,
                ratingTier: "poor",
                stars: 1,
              });
            }
          }
        }

        const summaries = await PerformanceSummary.find({})
          .populate({
            path: "employeeId",
            match: { active: true },
            select: "fullName email role active"
          })
          .sort({ currentRating: -1 });

        const activeSummaries = summaries.filter(s => s.employeeId);

        // Enhance with 'live' averages from KPIService as requested
        const liveNow = new Date();
        const curMonth = liveNow.getMonth() + 1;
        const curYear = liveNow.getFullYear();

        const enrichedData = await Promise.all(activeSummaries.map(async (s) => {
          const empId = s.employeeId._id;
          
          // Get the same live averages used in the modal
          const [l7, l30, l90, rolling] = await Promise.all([
            KPIService._calculateRollingAverage(empId, 7),
            KPIService._calculateRollingAverage(empId, 30),
            KPIService._calculateRollingAverage(empId, 90),
            PerformanceCalculationService.getRollingAverages(empId)
          ]);

          const data = s.toObject();
          data.averages = {
            last7Days: l7,
            last30Days: l30,
            last90Days: l90,
            thisMonth: rolling.thisMonth || 0
          };
          return data;
        }));

        return res.status(200).json({
          success: true,
          count: enrichedData.length,
          data: enrichedData,
        });
      }

      // --- HISTORICAL AGGREGATION LOGIC ---
      const targetMonth = parseInt(month);
      const targetYear = parseInt(year);

      // Create date range for the target month
      const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
      const endOfMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

      // Aggregate DailyPerformanceRecord for the month
      const historicalData = await DailyPerformanceRecord.aggregate([
        {
          $match: {
            date: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        {
          $group: {
            _id: "$employeeId",
            avgScore: { $avg: "$overallScore" },
            recordsCount: { $sum: 1 },
          },
        },
        {
          $sort: { avgScore: -1 },
        },
      ]);

      // Populate user info with strict active filter and live averages
      const results = [];
      const liveNow = new Date();
      const curMonth = liveNow.getMonth() + 1;
      const curYear = liveNow.getFullYear();

      for (const item of historicalData) {
        const user = await User.findOne({ _id: item._id, active: true }).select(
          "fullName email role active",
        );
        if (user) {
          const empId = user._id;
          // Even for historical views, rolling averages should be 'live' as per requirements
          const [l7, l30, l90, rolling] = await Promise.all([
            KPIService._calculateRollingAverage(empId, 7),
            KPIService._calculateRollingAverage(empId, 30),
            KPIService._calculateRollingAverage(empId, 90),
            PerformanceCalculationService.getRollingAverages(empId)
          ]);

          results.push({
            employeeId: user,
            currentRating: item.avgScore,
            ratingTier: PerformanceCalculationService.getRatingTier(item.avgScore),
            stars: PerformanceCalculationService.getStars(item.avgScore),
            isHistorical: true,
            month: targetMonth,
            year: targetYear,
            averages: {
              last7Days: l7,
              last30Days: l30,
              last90Days: l90,
              thisMonth: rolling.thisMonth || 0
            },
          });
        }
      }

      res.status(200).json({
        success: true,
        count: results.length,
        data: results,
      });
    } catch (error) {
      console.error("Error fetching all employee performance:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching employee performance data",
        error: error.message,
      });
    }
  },
);

module.exports = router;
