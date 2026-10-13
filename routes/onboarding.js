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
// Safe wrapper for multer document uploads
const handleCandidateUpload = (req, res, next) => {
  ctrl.uploadCandidateDocs(req, res, (err) => {
    if (err) {
      console.error("Candidate document upload error:", err.message);
      return res.status(400).json({
        success: false,
        message: err.message || "File upload failed. Please ensure file sizes are within 10MB.",
      });
    }
    next();
  });
};

router.post(
  "/:id/finalize",
  protect,
  authorize("Admin", "HR"),
  handleCandidateUpload,
  ctrl.finalizeOnboarding
);

// ── Public Portal Routes (token-based, no auth session) ───────────────────
router.get("/portal/:token", ctrl.getPortalData);
router.post("/portal/:token/save", ctrl.saveDraft);
router.post(
  "/portal/:token/submit",
  handleCandidateUpload,
  ctrl.submitForm
);

module.exports = router;
