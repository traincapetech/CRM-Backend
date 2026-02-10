const express = require("express");
const {
  getFeed,
  markActioned,
  createInternalAction,
} = require("../controllers/feed");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(protect); // Protect all routes

router.route("/").get(getFeed);

router.route("/:id/actioned").put(markActioned);

// Internal/Admin route - strict authorization
router
  .route("/internal/create")
  .post(authorize("Admin", "System"), createInternalAction); // Assuming 'System' or just limiting to Admin for now

module.exports = router;
