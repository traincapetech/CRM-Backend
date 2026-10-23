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
  deleteAsset,
} = require("../controllers/assetsController");

// Category Routes
router.get("/categories", protect, getCategories);
router.post("/categories", protect, authorize("Admin", "HR", "IT Manager"), createCategory);

// Dashboard Route
router.get(
  "/dashboard",
  protect,
  authorize("Admin", "HR", "Manager", "IT Manager"),
  getAssetDashboardStats
);

// Employee Asset Routes
router.get(
  "/employee/:employeeId/pending",
  protect,
  authorize("Admin", "HR", "IT Manager"),
  checkPendingAssetsForExit
);
router.get("/employee/:employeeId", protect, getEmployeeAssets);

// Maintenance Routes
router.put(
  "/maintenance/:maintenanceId",
  protect,
  authorize("Admin", "HR", "IT Manager"),
  updateMaintenance
);

// General Inventory Routes
router
  .route("/")
  .get(protect, getAssets)
  .post(protect, authorize("Admin", "HR", "IT Manager"), createAsset);

// Individual Asset Routes
router
  .route("/:id")
  .get(protect, getAssetById)
  .put(protect, authorize("Admin", "HR", "IT Manager"), updateAsset)
  .delete(protect, authorize("Admin"), deleteAsset);

router.post("/:id/assign", protect, authorize("Admin", "HR", "IT Manager"), assignAsset);
router.post("/:id/return", protect, authorize("Admin", "HR", "IT Manager"), returnAsset);
router.post(
  "/:id/maintenance",
  protect,
  authorize("Admin", "HR", "IT Manager"),
  addMaintenance
);

module.exports = router;
