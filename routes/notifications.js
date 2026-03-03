const express = require("express");
const router = express.Router();
const controller = require("../controllers/notification");
const { protect } = require("../middleware/auth");

router.get("/", protect, controller.getNotifications);
router.put("/:id/read", protect, controller.markAsRead);
router.put("/read-all", protect, controller.markAllRead);
router.delete("/:id", protect, controller.deleteNotification);

module.exports = router;
