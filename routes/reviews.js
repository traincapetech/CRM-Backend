const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  getTemplates,
  createTemplate,
  getCycles,
  createCycle,
  getMyReviews,
  getTeamReviews,
  getAllReviews,
  getReviewById,
  submitSelfReview,
  submitManagerReview,
  submitHRReview,
  finalizeReview,
  reopenReview,
  getEmployeeReviewHistory,
  getReviewStats,
} = require("../controllers/reviewsController");

// Template Routes
router
  .route("/templates")
  .get(protect, getTemplates)
  .post(protect, authorize("Admin", "HR"), createTemplate);

// Review Cycle Routes
router
  .route("/cycles")
  .get(protect, getCycles)
  .post(protect, authorize("Admin", "HR"), createCycle);

// Stats
router.get("/stats", protect, authorize("Admin", "HR", "Manager"), getReviewStats);

// Employee Self View
router.get("/my-reviews", protect, getMyReviews);

// Manager View
router.get("/team-reviews", protect, authorize("Admin", "HR", "Manager"), getTeamReviews);

// HR / Admin View All
router.get("/all", protect, authorize("Admin", "HR"), getAllReviews);

// Single Review & Submissions
router.get("/:id", protect, getReviewById);
router.put("/:id/self-review", protect, submitSelfReview);
router.put("/:id/manager-review", protect, authorize("Admin", "HR", "Manager"), submitManagerReview);
router.put("/:id/hr-review", protect, authorize("Admin", "HR"), submitHRReview);
router.put("/:id/finalize", protect, authorize("Admin", "HR"), finalizeReview);
router.post("/:id/reopen", protect, authorize("Admin"), reopenReview);

// History
router.get("/employee/:employeeId/history", protect, getEmployeeReviewHistory);

module.exports = router;
