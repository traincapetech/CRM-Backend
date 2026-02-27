const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const {
  getAdvances,
  createAdvance,
  updateAdvance,
  getAdvancesByEmployee,
  getAdvanceSummary,
  deleteAdvance,
} = require("../controllers/advances");

const router = express.Router();

// Summary route (must be before /:id)
router.route("/summary").get(protect, getAdvanceSummary);

// Employee-specific route (must be before /:id)
router.route("/employee/:employeeId").get(protect, getAdvancesByEmployee);

// Main routes
router
  .route("/")
  .get(protect, getAdvances)
  .post(protect, authorize("Admin"), createAdvance);

router
  .route("/:id")
  .put(protect, authorize("Admin"), updateAdvance)
  .delete(protect, authorize("Admin"), deleteAdvance);

module.exports = router;
