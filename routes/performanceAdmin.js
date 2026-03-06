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
          .populate("employeeId", "fullName email role active")
          .sort({ currentRating: -1 });

        const validSummaries = summaries.filter(
          (s) => s.employeeId && s.employeeId.active !== false,
        );

        return res.status(200).json({
          success: true,
          count: validSummaries.length,
          data: validSummaries,
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
            // We can also aggregate averages if they were stored per record, 
            // but usually we just want the monthly average here.
          },
        },
        {
          $sort: { avgScore: -1 },
        },
      ]);

      // Populate user info
      const results = [];
      for (const item of historicalData) {
        const user = await User.findById(item._id).select(
          "fullName email role active",
        );
        if (user && user.active !== false) {
          results.push({
            employeeId: user,
            currentRating: item.avgScore,
            ratingTier: PerformanceCalculationService.getRatingTier(
              item.avgScore,
            ),
            stars: PerformanceCalculationService.getStars(item.avgScore),
            isHistorical: true,
            month: targetMonth,
            year: targetYear,
            averages: {
              // For historical month, we treat the average of that month as the primary stat
              last30Days: item.avgScore,
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
