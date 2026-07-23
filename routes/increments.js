const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  createIncrementRequest,
  getIncrements,
  getMySalaryHistory,
  getIncrementById,
  verifyIncrement,
  approveIncrement,
  rejectIncrement,
  reopenIncrement,
  getEmployeeSalaryHistory,
  getIncrementStats,
} = require("../controllers/incrementsController");

// Stats & General
router.get("/stats", protect, authorize("Admin", "HR", "Manager"), getIncrementStats);
router.get("/my-history", protect, getMySalaryHistory);

// Listing & Creation
router
  .route("/")
  .get(protect, getIncrements)
  .post(protect, authorize("Admin", "HR", "Manager"), createIncrementRequest);

// Single Item & Approval Pipeline
router.get("/:id", protect, getIncrementById);
router.put("/:id/verify", protect, authorize("Admin", "HR"), verifyIncrement);
router.put("/:id/approve", protect, authorize("Admin"), approveIncrement);
router.put("/:id/reject", protect, authorize("Admin", "HR"), rejectIncrement);
router.post("/:id/reopen", protect, authorize("Admin"), reopenIncrement);

// Employee History
router.get("/employee/:employeeId/history", protect, getEmployeeSalaryHistory);

module.exports = router;
