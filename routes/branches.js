const express = require("express");
const router = express.Router();
const {
  getBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
} = require("../controllers/branches");

const { protect, authorize } = require("../middleware/auth");

// Require authentication for all branch routes
router.use(protect);

router
  .route("/")
  .get(getBranches)
  .post(authorize("Admin"), createBranch);

router
  .route("/:id")
  .get(getBranch)
  .put(authorize("Admin"), updateBranch)
  .delete(authorize("Admin"), deleteBranch);

module.exports = router;
