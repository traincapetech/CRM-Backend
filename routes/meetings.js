const express = require("express");
const router = express.Router();
const {
  createMeeting,
  getMeetings,
  getMeeting,
  endMeeting,
} = require("../controllers/meetings");
const { protect } = require("../middleware/auth");

// All routes are protected
router.use(protect);

router.post("/create", createMeeting);
router.get("/", getMeetings);
router.get("/:id", getMeeting);
router.patch("/:id/end", endMeeting);

module.exports = router;
