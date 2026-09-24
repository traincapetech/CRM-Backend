const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  getAssetDashboardStats,
  getAssets,
  getAssetById,
  createAsset,
  updateAsset,
  assignAsset,
  returnAsset,
  addMaintenance,
  updateMaintenance,
  getCategories,
  createCategory,
  getEmployeeAssets,
  checkPendingAssetsForExit,
} = require("../controllers/assetsController");

// Category Routes
router.get("/categories", protect, getCategories);
router.post("/categories", protect, authorize("Admin", "HR"), createCategory);

// Dashboard Route
router.get(
  "/dashboard",
  protect,
  authorize("Admin", "HR", "Manager"),
  getAssetDashboardStats
);

// Employee Asset Routes
router.get(
  "/employee/:employeeId/pending",
  protect,
  authorize("Admin", "HR"),
  checkPendingAssetsForExit
);
router.get("/employee/:employeeId", protect, getEmployeeAssets);

// Maintenance Routes
router.put(
  "/maintenance/:maintenanceId",
  protect,
  authorize("Admin", "HR"),
  updateMaintenance
);

// General Inventory Routes
router
  .route("/")
  .get(protect, getAssets)
  .post(protect, authorize("Admin", "HR"), createAsset);

// Individual Asset Routes
router
  .route("/:id")
  .get(protect, getAssetById)
  .put(protect, authorize("Admin", "HR"), updateAsset);

router.post("/:id/assign", protect, authorize("Admin", "HR"), assignAsset);
router.post("/:id/return", protect, authorize("Admin", "HR"), returnAsset);
router.post(
  "/:id/maintenance",
  protect,
  authorize("Admin", "HR"),
  addMaintenance
);

module.exports = router;
