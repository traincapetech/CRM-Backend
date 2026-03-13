const Holiday = require("../models/Holiday");
const User = require("../models/User");
const PerformanceCalculationService = require("../services/performanceCalculation");

// Helper to recalculate performance for all active employees
const recalculatePerformanceForToday = async () => {
  try {
    const activeEmployees = await User.find({ role: { $ne: "admin" }, active: true }).select("_id");
    const today = new Date();
    console.log(`[Holiday Event] Recalculating performance for ${activeEmployees.length} employees...`);
    for (const emp of activeEmployees) {
      await PerformanceCalculationService.calculateEmployeePerformance(emp._id, today).catch(err => {
        console.error(`Failed to recalculate for ${emp._id}:`, err.message);
      });
    }
  } catch (error) {
    console.error("Error triggering mass performance recalculation:", error);
  }
};

// @desc    Get all holidays
// @route   GET /api/holidays
// @access  Private
const getHolidays = async (req, res) => {
  try {
    const { year, month } = req.query;
    const query = {};

    if (year && month) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    } else if (year) {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31, 23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    const holidays = await Holiday.find(query).sort({ date: 1 }).populate("createdBy", "fullName email");

    res.status(200).json({
      success: true,
      count: holidays.length,
      data: holidays,
    });
  } catch (error) {
    console.error("Error fetching holidays:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching holidays",
      error: error.message,
    });
  }
};

// @desc    Create holiday
// @route   POST /api/holidays
// @access  Private (Admin, HR)
const createHoliday = async (req, res) => {
  try {
    const dateStr = new Date(req.body.date).toISOString().split("T")[0];

    const holidayData = {
      ...req.body,
      dateKey: dateStr,
      createdBy: req.user._id,
    };
    const existing = await Holiday.findOne({ dateKey: dateStr });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Holiday already exists for date ${dateStr}`,
      });
    }

    const holiday = await Holiday.create(holidayData);

    res.status(201).json({
      success: true,
      message: "Holiday created successfully",
      data: holiday,
    });

    // Trigger recalculation in background
    if (holiday.type === "full-day" || holiday.type === "half-day") {
      recalculatePerformanceForToday();
    }
  } catch (error) {
    console.error("Error creating holiday:", error);
    res.status(500).json({
      success: false,
      message: "Error creating holiday",
      error: error.message,
    });
  }
};

// @desc    Update holiday
// @route   PUT /api/holidays/:id
// @access  Private (Admin, HR)
const updateHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!holiday) {
      return res.status(404).json({
        success: false,
        message: "Holiday not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Holiday updated successfully",
      data: holiday,
    });

    // Trigger recalculation in background
    if (holiday.type === "full-day" || holiday.type === "half-day") {
      recalculatePerformanceForToday();
    }
  } catch (error) {
    console.error("Error updating holiday:", error);
    res.status(500).json({
      success: false,
      message: "Error updating holiday",
      error: error.message,
    });
  }
};

// @desc    Delete holiday
// @route   DELETE /api/holidays/:id
// @access  Private (Admin, HR)
const deleteHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.findByIdAndDelete(req.params.id);

    if (!holiday) {
      return res.status(404).json({
        success: false,
        message: "Holiday not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Holiday deleted successfully",
    });

    // Trigger recalculation in background since a holiday was removed
    if (holiday.type === "full-day" || holiday.type === "half-day") {
      recalculatePerformanceForToday();
    }
  } catch (error) {
    console.error("Error deleting holiday:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting holiday",
      error: error.message,
    });
  }
};

module.exports = {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
};
