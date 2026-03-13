const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");

const {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
} = require("../controllers/holidays");

router
  .route("/")
  .get(protect, getHolidays)
  .post(protect, authorize("Admin", "HR"), createHoliday);

router
  .route("/:id")
  .put(protect, authorize("Admin", "HR"), updateHoliday)
  .delete(protect, authorize("Admin", "HR"), deleteHoliday);

module.exports = router;
