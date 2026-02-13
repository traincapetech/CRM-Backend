const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");

const {
  getKPITemplates,
  createKPITemplate,
  getKPITemplate,
  updateKPITemplate,
  deleteKPITemplate,
  assignKPIToEmployees,
  getEmployeePerformance,
  getEmployeeDailyPerformance,
  getTeamPerformance,
} = require("../controllers/performance");

// KPI Template Management
router
  .route("/kpis")
  .get(
    protect,
    authorize("Admin", "HR", "Manager", "Lead Person"),
    getKPITemplates,
  )
  .post(protect, authorize("Admin", "HR"), createKPITemplate);

router
  .route("/kpis/:id")
  .get(protect, getKPITemplate)
  .put(protect, authorize("Admin", "HR"), updateKPITemplate)
  .delete(protect, authorize("Admin", "HR"), deleteKPITemplate);

router
  .route("/kpis/:id/assign")
  .post(protect, authorize("Admin", "HR", "Manager"), assignKPIToEmployees);

// Employee Performance
router.route("/employee/:id").get(protect, getEmployeePerformance);

router.route("/employee/:id/daily").get(protect, getEmployeeDailyPerformance);

// Team Performance
router
  .route("/team/:managerId")
  .get(protect, authorize("Admin", "HR", "Manager"), getTeamPerformance);

// Admin/Testing Routes
const adminRoutes = require("./performanceAdmin");
router.use(adminRoutes);

module.exports = router;
