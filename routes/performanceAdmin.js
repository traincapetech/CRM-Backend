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

module.exports = router;
