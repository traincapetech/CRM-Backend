const express = require("express");
const router = express.Router();
const {
  createMeeting,
  getMeetings,
  getMeeting,
  endMeeting,
  getMyMeetings,
  inviteParticipants,
} = require("../controllers/meetings");
const { protect } = require("../middleware/auth");

// All routes are protected
router.use(protect);

router.get("/my-huddles", getMyMeetings);
router.post("/create", createMeeting);
router.get("/", getMeetings);
router.get("/:id", getMeeting);
router.patch("/:id/end", endMeeting);
router.patch("/:id/invite", inviteParticipants);

module.exports = router;
