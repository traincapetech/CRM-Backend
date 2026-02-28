const IncentiveCycle = require("../models/IncentiveCycle");
const User = require("../models/User");

// @desc    Get quarterly incentives list with manual tracking data
// @route   GET /api/quarterly-incentives
// @access  Private (Admin/HR/Manager)
exports.getQuarterlyIncentives = async (req, res) => {
  try {
    // Determine the users to fetch - typically Sales and Lead roles
    const users = await User.find({ active: true })
      .select("_id fullName role")
      .populate("role");

    const result = [];

    for (const user of users) {
      // Find the active cycle for this user
      let cycle = await IncentiveCycle.findOne({
        employeeId: user._id,
        status: "ACTIVE",
      });

      // If no active cycle exists, create one starting from today
      if (!cycle) {
        cycle = await IncentiveCycle.create({
          employeeId: user._id,
          startDate: new Date(),
          status: "ACTIVE",
          months: [
            { monthIndex: 1, salesCount: 0 },
            { monthIndex: 2, salesCount: 0 },
            { monthIndex: 3, salesCount: 0 },
          ],
        });
      }

      // Calculate the 3 months boundary based on startDate purely for display metrics
      const currentMonthIndex =
        new Date().getMonth() -
        cycle.startDate.getMonth() +
        12 * (new Date().getFullYear() - cycle.startDate.getFullYear());

      // Ensure the array always has 3 months represented
      const monthsData = [
        {
          count: cycle.months?.find((m) => m.monthIndex === 1)?.salesCount || 0,
        },
        {
          count: cycle.months?.find((m) => m.monthIndex === 2)?.salesCount || 0,
        },
        {
          count: cycle.months?.find((m) => m.monthIndex === 3)?.salesCount || 0,
        },
      ];

      result.push({
        user: {
          _id: user._id,
          fullName: user.fullName,
          roleName: user.role?.name || "User",
        },
        cycleId: cycle._id,
        cycleStartDate: cycle.startDate,
        currentMonthIndex: currentMonthIndex + 1, // 1-indexed for display purely
        months: monthsData,
        incentiveAmount: cycle.incentiveAmount || 0,
        totalSales: cycle.totalSalesCount || 0,
        isReadyToClear: currentMonthIndex >= 2, // True if 3 months (or more) have passed in time
      });
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get quarterly incentives error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Update manual sales tracking and incentive amount
// @route   PUT /api/quarterly-incentives/:cycleId
// @access  Private (Admin/HR/Manager)
exports.updateQuarterlyIncentive = async (req, res) => {
  try {
    const { cycleId } = req.params;
    const { month1Sales, month2Sales, month3Sales, incentiveAmount } = req.body;

    const cycle = await IncentiveCycle.findById(cycleId);
    if (!cycle) {
      return res
        .status(404)
        .json({ success: false, message: "Cycle not found" });
    }

    if (cycle.status === "CLEARED") {
      return res
        .status(400)
        .json({ success: false, message: "Cannot edit a cleared cycle" });
    }

    // Update the array mapping
    cycle.months = [
      { monthIndex: 1, salesCount: month1Sales || 0 },
      { monthIndex: 2, salesCount: month2Sales || 0 },
      { monthIndex: 3, salesCount: month3Sales || 0 },
    ];

    cycle.totalSalesCount =
      (month1Sales || 0) + (month2Sales || 0) + (month3Sales || 0);

    cycle.incentiveAmount = incentiveAmount || 0;

    await cycle.save();

    res.status(200).json({
      success: true,
      data: cycle,
      message: "Incentive tracker updated successfully",
    });
  } catch (error) {
    console.error("Update quarterly incentive error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Clear a quarterly incentive cycle and start a new one
// @route   POST /api/quarterly-incentives/clear
// @access  Private (Admin/HR/Manager)
exports.clearQuarterlyIncentiveCycle = async (req, res) => {
  try {
    const { cycleId } = req.body;

    const cycle = await IncentiveCycle.findById(cycleId);

    if (!cycle) {
      return res
        .status(404)
        .json({ success: false, message: "Cycle not found" });
    }

    if (cycle.status === "CLEARED") {
      return res
        .status(400)
        .json({ success: false, message: "Cycle is already cleared" });
    }

    // Mark current cycle as cleared
    cycle.status = "CLEARED";
    cycle.endDate = new Date();
    cycle.clearedBy = req.user.id;
    await cycle.save();

    // Start a new cycle for this user immediately
    const newCycle = await IncentiveCycle.create({
      employeeId: cycle.employeeId,
      startDate: new Date(),
      status: "ACTIVE",
      months: [
        { monthIndex: 1, salesCount: 0 },
        { monthIndex: 2, salesCount: 0 },
        { monthIndex: 3, salesCount: 0 },
      ],
    });

    res.status(200).json({
      success: true,
      data: {
        clearedCycle: cycle,
        newCycle: newCycle,
      },
      message: "Cycle cleared and new cycle started successfully",
    });
  } catch (error) {
    console.error("Clear quarterly incentive error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
