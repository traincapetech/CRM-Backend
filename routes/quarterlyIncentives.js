const express = require("express");
const {
  getQuarterlyIncentives,
  updateQuarterlyIncentive,
  clearQuarterlyIncentiveCycle,
} = require("../controllers/quarterlyIncentives");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// All routes are protected and restricted to Admin, HR, Manager
router.use(protect);
router.use(authorize("Admin", "HR", "Manager"));

router.get("/", getQuarterlyIncentives);
router.put("/:cycleId", updateQuarterlyIncentive);
router.post("/clear", clearQuarterlyIncentiveCycle);

module.exports = router;
