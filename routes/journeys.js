const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const {
  getJourneys,
  getJourney,
  completeStep,
  createTemplate,
  startJourney,
} = require("../controllers/journeys");

const router = express.Router();

router.use(protect);

router.get("/", getJourneys);
router.get("/:id", getJourney);
router.post("/:id/steps/:stepId/complete", completeStep);

// Admin/Internal only
router.post("/templates", authorize("Admin"), createTemplate);
router.post("/start", authorize("Admin", "HR"), startJourney);

module.exports = router;
