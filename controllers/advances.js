const EmployeeAdvance = require("../models/EmployeeAdvance");
const Employee = require("../models/Employee");

// @desc    Get all advances (role-based filtering)
// @route   GET /api/advances
// @access  Private
exports.getAdvances = async (req, res) => {
  try {
    const { status, employeeId } = req.query;
    let query = {};

    // Role-based filtering
    if (
      [
        "Employee",
        "Sales Person",
        "Lead Person",
        "IT Staff",
        "IT Intern",
      ].includes(req.user.role)
    ) {
      // Non-admin/manager users can only see their own advances
      const employee = await Employee.findOne({ userId: req.user.id });
      if (!employee) {
        return res.status(200).json({ success: true, count: 0, data: [] });
      }
      query.employeeId = employee._id;
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    if (status) {
      query.status = status;
    }

    const advances = await EmployeeAdvance.find(query)
      .populate({
        path: "employeeId",
        select: "fullName email department role",
        populate: [
          { path: "department", select: "name" },
          { path: "role", select: "name" },
        ],
      })
      .populate("createdBy", "fullName email")
      .populate("deductionHistory.deductedBy", "fullName")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: advances.length,
      data: advances,
    });
  } catch (error) {
    console.error("Error fetching advances:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Create a new advance (Admin only)
// @route   POST /api/advances
// @access  Private (Admin)
exports.createAdvance = async (req, res) => {
  try {
    const {
      employeeId,
      totalAmount,
      description,
      deductionType,
      deductionAmountPerMonth,
    } = req.body;

    // Validate employee exists
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Validate deduction configuration
    if (deductionType === "partial") {
      if (!deductionAmountPerMonth || deductionAmountPerMonth <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "Monthly deduction amount is required for partial deductions",
        });
      }
      if (deductionAmountPerMonth > totalAmount) {
        return res.status(400).json({
          success: false,
          message:
            "Monthly deduction amount cannot exceed total advance amount",
        });
      }
    }

    const advance = await EmployeeAdvance.create({
      employeeId: employee._id,
      totalAmount,
      remainingAmount: totalAmount,
      deductionType,
      deductionAmountPerMonth:
        deductionType === "full" ? totalAmount : deductionAmountPerMonth,
      status: "active",
      description: description || "",
      createdBy: req.user.id,
    });

    // Populate for response
    await advance.populate({
      path: "employeeId",
      select: "fullName email department role",
      populate: [
        { path: "department", select: "name" },
        { path: "role", select: "name" },
      ],
    });
    await advance.populate("createdBy", "fullName email");

    res.status(201).json({
      success: true,
      data: advance,
      message: "Advance created successfully",
    });
  } catch (error) {
    console.error("Error creating advance:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};

// @desc    Update advance deduction settings (Admin only)
// @route   PUT /api/advances/:id
// @access  Private (Admin)
exports.updateAdvance = async (req, res) => {
  try {
    const advance = await EmployeeAdvance.findById(req.params.id);
    if (!advance) {
      return res.status(404).json({
        success: false,
        message: "Advance not found",
      });
    }

    if (advance.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot update a completed advance",
      });
    }

    const { deductionType, deductionAmountPerMonth, description } = req.body;

    if (deductionType) {
      advance.deductionType = deductionType;
      if (deductionType === "full") {
        advance.deductionAmountPerMonth = advance.remainingAmount;
      }
    }

    if (
      deductionAmountPerMonth !== undefined &&
      advance.deductionType === "partial"
    ) {
      if (deductionAmountPerMonth <= 0) {
        return res.status(400).json({
          success: false,
          message: "Deduction amount must be greater than 0",
        });
      }
      if (deductionAmountPerMonth > advance.remainingAmount) {
        return res.status(400).json({
          success: false,
          message: "Deduction amount cannot exceed remaining balance",
        });
      }
      advance.deductionAmountPerMonth = deductionAmountPerMonth;
    }

    if (description !== undefined) {
      advance.description = description;
    }

    await advance.save();

    // Populate for response
    await advance.populate({
      path: "employeeId",
      select: "fullName email department role",
      populate: [
        { path: "department", select: "name" },
        { path: "role", select: "name" },
      ],
    });
    await advance.populate("createdBy", "fullName email");

    res.status(200).json({
      success: true,
      data: advance,
      message: "Advance updated successfully",
    });
  } catch (error) {
    console.error("Error updating advance:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Get advances for a specific employee
// @route   GET /api/advances/employee/:employeeId
// @access  Private
exports.getAdvancesByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Authorization check: non-admin users can only see their own
    if (!["Admin", "HR", "Manager", "IT Manager"].includes(req.user.role)) {
      const employee = await Employee.findOne({ userId: req.user.id });
      if (!employee || employee._id.toString() !== employeeId) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to view these advances",
        });
      }
    }

    const advances = await EmployeeAdvance.find({ employeeId })
      .populate({
        path: "employeeId",
        select: "fullName email department role",
        populate: [
          { path: "department", select: "name" },
          { path: "role", select: "name" },
        ],
      })
      .populate("createdBy", "fullName email")
      .populate("deductionHistory.deductedBy", "fullName")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: advances.length,
      data: advances,
    });
  } catch (error) {
    console.error("Error fetching employee advances:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Get advance summary stats
// @route   GET /api/advances/summary
// @access  Private
exports.getAdvanceSummary = async (req, res) => {
  try {
    let matchStage = {};

    // Non-admin users see only their own
    if (!["Admin", "HR", "Manager", "IT Manager"].includes(req.user.role)) {
      const employee = await Employee.findOne({ userId: req.user.id });
      if (!employee) {
        return res.status(200).json({
          success: true,
          data: {
            totalBorrowed: 0,
            totalDeducted: 0,
            totalRemaining: 0,
            activeCount: 0,
            completedCount: 0,
          },
        });
      }
      matchStage.employeeId = employee._id;
    }

    const advances = await EmployeeAdvance.find(matchStage);

    const summary = {
      totalBorrowed: advances.reduce((sum, a) => sum + a.totalAmount, 0),
      totalRemaining: advances.reduce((sum, a) => sum + a.remainingAmount, 0),
      totalDeducted: advances.reduce(
        (sum, a) => sum + (a.totalAmount - a.remainingAmount),
        0,
      ),
      activeCount: advances.filter((a) => a.status === "active").length,
      completedCount: advances.filter((a) => a.status === "completed").length,
    };

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching advance summary:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Delete an advance (Admin only, only if no deductions made)
// @route   DELETE /api/advances/:id
// @access  Private (Admin)
exports.deleteAdvance = async (req, res) => {
  try {
    const advance = await EmployeeAdvance.findById(req.params.id);
    if (!advance) {
      return res.status(404).json({
        success: false,
        message: "Advance not found",
      });
    }

    await advance.deleteOne();

    res.status(200).json({
      success: true,
      data: {},
      message: "Advance deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting advance:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
