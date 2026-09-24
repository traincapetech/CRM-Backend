const kpiService = require("../services/kpiService");

// @desc    Get KPI breakdown for an employee
// @route   GET /api/performance/kpi-breakdown
// @access  Private
const getKpiBreakdown = async (req, res) => {
  try {
    const { employeeId, month, year } = req.query;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID is required",
      });
    }

    const now = new Date();
    const targetMonth = month ? parseInt(month) : now.getMonth() + 1;
    const targetYear = year ? parseInt(year) : now.getFullYear();

    const data = await kpiService.getKpiBreakdown(employeeId, targetMonth, targetYear);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "No KPI found",
      });
    }

    res.status(200).json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error("Error in getKpiBreakdown controller:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching KPI breakdown",
      error: error.message,
    });
  }
};

module.exports = {
  getKpiBreakdown,
};
