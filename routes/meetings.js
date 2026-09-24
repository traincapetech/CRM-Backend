const express = require("express");
const router = express.Router();
const {
  createMeeting,
  getMeetings,
  getMeeting,
  endMeeting,
  getMyMeetings,
  inviteParticipants,
  updateMeeting,
  cancelMeeting,
} = require("../controllers/meetings");
const { protect } = require("../middleware/auth");

// All routes are protected
router.use(protect);

router.get("/my-huddles", getMyMeetings);
router.post("/create", createMeeting);
router.get("/", getMeetings);
router.get("/:id", getMeeting);
router.put("/:id", updateMeeting);
router.patch("/:id/end", endMeeting);
router.patch("/:id/cancel", cancelMeeting);
router.patch("/:id/invite", inviteParticipants);

module.exports = router;
