const express = require("express");
const router = express.Router();
const {
  submitShiftReport,
  getTodayReport,
  getMyReports,
  getTeamShiftReports,
} = require("../controllers/shiftReports");

const { protect, authorize } = require("../middleware/auth");

// All routes require authentication
router.use(protect);

router.post("/", submitShiftReport);
router.get("/today", getTodayReport);
router.get("/my", getMyReports);
router.get(
  "/team",
  authorize("Admin", "Manager", "Sales Manager", "Sales Team Leader", "Team Leader", "Lead Person", "Branch Partner", "HR"),
  getTeamShiftReports
);

module.exports = router;

