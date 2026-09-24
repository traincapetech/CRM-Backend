const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const ctrl = require("../controllers/onboarding");

// ── HR/Admin Protected Routes ─────────────────────────────────────────────
const hrRoles = ["Admin", "HR", "Manager", "IT Manager"];

router.post("/invite", protect, authorize(...hrRoles), ctrl.createInvite);
router.get("/queue", protect, authorize(...hrRoles), ctrl.getQueue);
router.get("/managers", protect, authorize(...hrRoles), ctrl.getManagersByDept);
router.get("/queue/:id", protect, authorize(...hrRoles), ctrl.getCandidateDetail);
router.put("/:id/status", protect, authorize(...hrRoles), ctrl.updateStatus);
router.post("/:id/resend-link", protect, authorize(...hrRoles), ctrl.resendLink);
router.delete("/:id", protect, authorize("Admin", "HR"), ctrl.deleteInvite);
router.delete("/:id/revoke", protect, authorize("Admin", "HR"), ctrl.revokeToken);
router.post(
  "/:id/finalize",
  protect,
  authorize("Admin", "HR"),
  ctrl.uploadCandidateDocs,
  ctrl.finalizeOnboarding
);

// ── Public Portal Routes (token-based, no auth session) ───────────────────
router.get("/portal/:token", ctrl.getPortalData);
router.post("/portal/:token/save", ctrl.saveDraft);
router.post(
  "/portal/:token/submit",
  ctrl.uploadCandidateDocs,
  ctrl.submitForm
);

module.exports = router;
