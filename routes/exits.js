const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const {
  getExitDashboard,
  getExits,
  createExitRequest,
  getMyExit,
  getExitById,
  reviewManagerExit,
  updateChecklist,
  updateAssetClearance,
  updateFnFSettlement,
  recordExitInterview,
  finalApproveExit,
  withdrawExit,
} = require("../controllers/exitsController");

router.use(protect);

router.get("/dashboard", getExitDashboard);
router.get("/my", getMyExit);
router.get("/", getExits);
router.get("/:id", getExitById);
router.post("/", createExitRequest);

router.put("/:id/manager-review", reviewManagerExit);
router.put("/:id/checklist", updateChecklist);
router.put("/:id/asset-clearance", updateAssetClearance);
router.put("/:id/fnf-settlement", updateFnFSettlement);
router.post("/:id/exit-interview", recordExitInterview);
router.put("/:id/final-approve", finalApproveExit);
router.post("/:id/withdraw", withdrawExit);

module.exports = router;
