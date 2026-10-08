const express = require("express");
const router = express.Router();
const {
  getBranchSalesSummary,
  getBranchMonthlyTrends,
  getBranchLeaderboard,
} = require("../controllers/branchAnalyticsController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);
router.use(authorize("Admin", "Branch Partner"));

router.get("/summary", getBranchSalesSummary);
router.get("/trends", getBranchMonthlyTrends);
router.get("/leaderboard", getBranchLeaderboard);

module.exports = router;
