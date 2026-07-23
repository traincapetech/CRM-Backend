const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  createPromotionRequest,
  getPromotions,
  getMyPromotions,
  getPromotionById,
  verifyPromotion,
  approvePromotion,
  rejectPromotion,
  reopenPromotion,
  getEmployeePromotionHistory,
  getPromotionStats,
} = require("../controllers/promotionsController");

// Stats & General
router.get("/stats", protect, authorize("Admin", "HR", "Manager"), getPromotionStats);
router.get("/my-promotions", protect, getMyPromotions);

// Listing & Creation
router
  .route("/")
  .get(protect, getPromotions)
  .post(protect, authorize("Admin", "HR", "Manager"), createPromotionRequest);

// Single Item & Approval Pipeline
router.get("/:id", protect, getPromotionById);
router.put("/:id/verify", protect, authorize("Admin", "HR"), verifyPromotion);
router.put("/:id/approve", protect, authorize("Admin"), approvePromotion);
router.put("/:id/reject", protect, authorize("Admin", "HR"), rejectPromotion);
router.post("/:id/reopen", protect, authorize("Admin"), reopenPromotion);

// Employee History
router.get("/employee/:employeeId/history", protect, getEmployeePromotionHistory);

module.exports = router;
