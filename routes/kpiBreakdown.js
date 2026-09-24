const express = require("express");
const router = express.Router();
const { getKpiBreakdown } = require("../controllers/kpiBreakdown");
const { protect } = require("../middleware/auth");

router.get("/", protect, getKpiBreakdown);

module.exports = router;
