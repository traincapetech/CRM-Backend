/**
 * Email Campaign Routes
 */

const express = require("express");
const router = express.Router();
const {
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  sendCampaign,
  getCampaignAnalytics,
  deleteCampaign,
  getAvailableCourses,
  previewCourseRecipients,
  trackOpen,
  trackClick,
  cloneCampaign,
  getRecipientEngagement,
  sendReminder,
} = require("../controllers/emailCampaigns");
const { getQueueStatus, getQueueStats } = require("../services/emailQueue");

const { protect, authorize } = require("../middleware/auth");
const { cacheMiddleware, invalidateCache } = require("../middleware/cache");

// Tracking routes (public)
router.get("/track/open", trackOpen);
router.get("/track/click", trackClick);

// All routes require authentication
router.use(protect);

// Get all campaigns (must be before /:id route)
router.get(
  "/",
  authorize("Admin", "Manager", "Lead Person"),
  cacheMiddleware(300),
  getCampaigns,
);

// Course-related routes (must be before /:id route to avoid route conflicts)
// These specific routes must come before parameterized routes like /:id
router.get(
  "/courses/available",
  authorize("Admin", "Manager", "Lead Person"),
  cacheMiddleware(600),
  getAvailableCourses,
);
router.post(
  "/courses/preview",
  authorize("Admin", "Manager", "Lead Person"),
  previewCourseRecipients,
);

// Get single campaign (this must come after all specific routes)
router.get("/:id", authorize("Admin", "Manager", "Lead Person"), getCampaign);

// Create campaign
router.post(
  "/",
  authorize("Admin", "Manager", "Lead Person"),
  invalidateCache(["cache:/api/email-campaigns*"]),
  createCampaign,
);

// Update campaign
router.put(
  "/:id",
  authorize("Admin", "Manager", "Lead Person"),
  invalidateCache(["cache:/api/email-campaigns*"]),
  updateCampaign,
);

// Send campaign
router.post(
  "/:id/send",
  authorize("Admin", "Manager", "Lead Person"),
  sendCampaign,
);

// Get analytics
router.get(
  "/:id/analytics",
  authorize("Admin", "Manager", "Lead Person"),
  getCampaignAnalytics,
);

// ========== Enterprise Features ==========
// Clone campaign (for follow-ups)
router.post(
  "/:id/clone",
  authorize("Admin", "Manager", "Lead Person"),
  invalidateCache(["cache:/api/email-campaigns*"]),
  cloneCampaign,
);

// Get recipient engagement (who opened/clicked)
router.get(
  "/:id/recipients",
  authorize("Admin", "Manager", "Lead Person"),
  getRecipientEngagement,
);

// Send reminder to non-openers
router.post(
  "/:id/send-reminder",
  authorize("Admin", "Manager", "Lead Person"),
  invalidateCache(["cache:/api/email-campaigns*"]),
  sendReminder,
);
// =========================================

// Delete campaign
router.delete(
  "/:id",
  authorize("Admin", "Manager", "Lead Person"),
  invalidateCache(["cache:/api/email-campaigns*"]),
  deleteCampaign,
);

// Queue status endpoints
router.get("/queue/status", authorize("Admin", "Manager"), async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.status(200).json({
      success: true,
      data: stats || {
        message: "Queue not available (Redis may not be connected)",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get(
  "/:id/queue-status",
  authorize("Admin", "Manager"),
  async (req, res) => {
    try {
      const status = await getQueueStatus(req.params.id);
      res.status(200).json({
        success: true,
        data: status || {
          message: "Queue not available (Redis may not be connected)",
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
);

module.exports = router;
