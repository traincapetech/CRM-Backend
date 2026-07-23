const SalaryIncrement = require("../models/SalaryIncrement");
const SalaryHistory = require("../models/SalaryHistory");
const Employee = require("../models/Employee");
const User = require("../models/User");
const EmployeeTimeline = require("../models/EmployeeTimeline");
const Log = require("../models/Log");
const { sendNotification, notifyAdmins } = require("../services/notificationService");

// @desc    Create salary increment request
// @route   POST /api/increments
// @access  Private (Manager/HR/Admin)
exports.createIncrementRequest = async (req, res) => {
  try {
    const {
      employeeId,
      incrementType,
      incrementAmount,
      incrementPercentage,
      effectiveDate,
      reason,
      reviewId,
      promotionId,
      notes,
    } = req.body;

    const employee = await Employee.findById(employeeId)
      .populate("department")
      .populate("role")
      .populate("reportingManager");

    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    const previousSalary = employee.salary || 0;
    let finalAmount = 0;
    let finalPercentage = 0;

    if (incrementAmount && Number(incrementAmount) > 0) {
      finalAmount = Number(incrementAmount);
      finalPercentage = previousSalary > 0 ? Number(((finalAmount / previousSalary) * 100).toFixed(2)) : 0;
    } else if (incrementPercentage && Number(incrementPercentage) > 0) {
      finalPercentage = Number(incrementPercentage);
      finalAmount = Math.round((previousSalary * finalPercentage) / 100);
    } else {
      return res.status(400).json({ success: false, message: "Please specify a valid increment amount or percentage" });
    }

    const newSalary = previousSalary + finalAmount;
    const initialStatus = req.user.role === "Admin" ? "PENDING_ADMIN" : "PENDING_HR";

    const increment = await SalaryIncrement.create({
      employeeId: employee._id,
      userId: employee.userId || employee._id,
      incrementType: incrementType || "ANNUAL_APPRAISAL",

      previousSalary,
      incrementAmount: finalAmount,
      incrementPercentage: finalPercentage,
      newSalary,

      effectiveDate: effectiveDate || new Date(),
      reason,
      reviewId: reviewId || null,
      promotionId: promotionId || null,
      notes: notes || "",

      status: initialStatus,
      requestedBy: req.user.id || req.user._id,
      historyLog: [
        {
          action: "INCREMENT_REQUESTED",
          performedBy: req.user.id || req.user._id,
          notes: `Salary increment request (+₹${finalAmount.toLocaleString()}, ${finalPercentage}%) submitted by ${req.user.fullName || "User"}.`,
        },
      ],
    });

    await notifyAdmins({
      type: "SALARY_INCREMENT_REQUESTED",
      message: `Salary increment request (+₹${finalAmount.toLocaleString()}) created for ${employee.fullName} by ${req.user.fullName}.`,
    });

    res.status(201).json({
      success: true,
      data: increment,
    });
  } catch (err) {
    console.error("Error creating salary increment request:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get salary increment requests list
// @route   GET /api/increments
// @access  Private
exports.getIncrements = async (req, res) => {
  try {
    let query = {};
    if (["Admin", "HR"].includes(req.user.role)) {
      query = {};
    } else if (req.user.role === "Manager") {
      const myEmployees = await Employee.find({ reportingManager: req.user.id }).select("_id");
      const empIds = myEmployees.map((e) => e._id);
      query = { $or: [{ employeeId: { $in: empIds } }, { requestedBy: req.user.id }] };
    } else {
      query = { userId: req.user.id };
    }

    const increments = await SalaryIncrement.find(query)
      .populate("employeeId", "fullName email profilePicture photo department role salary")
      .populate("userId", "fullName email profilePicture")
      .populate("requestedBy", "fullName email role")
      .populate("reviewId", "finalRecommendation managerReview")
      .populate("promotionId", "proposedRole proposedDepartment")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: increments.length,
      data: increments,
    });
  } catch (err) {
    console.error("Error fetching salary increments:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get employee's own salary & increment history
// @route   GET /api/increments/my-history
// @access  Private
exports.getMySalaryHistory = async (req, res) => {
  try {
    const history = await SalaryHistory.find({ userId: req.user.id })
      .populate("approvedBy", "fullName email")
      .sort({ effectiveDate: -1 });

    const requests = await SalaryIncrement.find({ userId: req.user.id })
      .populate("requestedBy", "fullName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        history,
        requests,
      },
    });
  } catch (err) {
    console.error("Error fetching my salary history:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get single increment request by ID
// @route   GET /api/increments/:id
// @access  Private
exports.getIncrementById = async (req, res) => {
  try {
    const increment = await SalaryIncrement.findById(req.params.id)
      .populate("employeeId")
      .populate("userId", "fullName email profilePicture")
      .populate("requestedBy", "fullName email role")
      .populate("hrVerification.verifiedBy", "fullName email")
      .populate("adminApproval.approvedBy", "fullName email")
      .populate("reviewId")
      .populate("promotionId")
      .populate("historyLog.performedBy", "fullName email role");

    if (!increment) {
      return res.status(404).json({ success: false, message: "Salary increment request not found" });
    }

    res.status(200).json({
      success: true,
      data: increment,
    });
  } catch (err) {
    console.error("Error fetching increment details:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    HR verification step
// @route   PUT /api/increments/:id/verify
// @access  Private (HR/Admin)
exports.verifyIncrement = async (req, res) => {
  try {
    const { comments } = req.body;

    const increment = await SalaryIncrement.findById(req.params.id);
    if (!increment) {
      return res.status(404).json({ success: false, message: "Salary increment request not found" });
    }

    if (!["Admin", "HR"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Only HR or Admin can verify salary increments" });
    }

    increment.hrVerification = {
      verifiedBy: req.user.id || req.user._id,
      verifiedAt: new Date(),
      comments: comments || "HR verification completed.",
      verified: true,
    };

    increment.status = "PENDING_ADMIN";
    increment.historyLog.push({
      action: "HR_VERIFIED",
      performedBy: req.user.id || req.user._id,
      notes: comments || "HR verified salary increment proposal.",
    });

    await increment.save();

    await notifyAdmins({
      type: "SALARY_INCREMENT_HR_VERIFIED",
      message: `Salary increment verified by HR (${req.user.fullName}). Awaiting Admin final approval.`,
    });

    res.status(200).json({
      success: true,
      data: increment,
    });
  } catch (err) {
    console.error("Error verifying salary increment:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Final Admin approval & salary update execution
// @route   PUT /api/increments/:id/approve
// @access  Private (Admin only)
exports.approveIncrement = async (req, res) => {
  try {
    const { comments, overridePercentage, overrideNewSalary } = req.body;

    if (req.user.role !== "Admin") {
      return res.status(403).json({ success: false, message: "Only Admin can approve salary increments" });
    }

    const increment = await SalaryIncrement.findById(req.params.id)
      .populate("employeeId");

    if (!increment) {
      return res.status(404).json({ success: false, message: "Salary increment request not found" });
    }

    if (increment.status === "APPROVED") {
      return res.status(400).json({ success: false, message: "Salary increment is already approved" });
    }

    const employee = await Employee.findById(increment.employeeId._id || increment.employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: "Target employee record not found" });
    }

    const oldSalary = employee.salary || increment.previousSalary || 0;

    // Handle Admin Override if provided
    let wasModifiedByAdmin = false;
    const origPct = increment.incrementPercentage;
    const origSal = increment.newSalary;

    if (overridePercentage !== undefined && overridePercentage !== null && overridePercentage !== "") {
      const newPct = Number(overridePercentage);
      if (!isNaN(newPct) && newPct >= 0) {
        wasModifiedByAdmin = true;
        increment.incrementPercentage = newPct;
        increment.incrementAmount = Math.round((oldSalary * newPct) / 100);
        increment.newSalary = oldSalary + increment.incrementAmount;
      }
    } else if (overrideNewSalary !== undefined && overrideNewSalary !== null && overrideNewSalary !== "") {
      const newSal = Number(overrideNewSalary);
      if (!isNaN(newSal) && newSal >= oldSalary) {
        wasModifiedByAdmin = true;
        increment.newSalary = newSal;
        increment.incrementAmount = newSal - oldSalary;
        increment.incrementPercentage = oldSalary > 0 ? Number(((increment.incrementAmount / oldSalary) * 100).toFixed(2)) : 0;
      }
    }

    // 🚀 EXECUTION 1: Update Employee.salary in Database
    employee.salary = increment.newSalary;
    await employee.save();

    // 🚀 EXECUTION 2: Record Permanent Entry in SalaryHistory Collection
    await SalaryHistory.create({
      employeeId: employee._id,
      userId: employee.userId || employee._id,
      incrementId: increment._id,
      promotionId: increment.promotionId || null,
      reviewId: increment.reviewId || null,
      previousSalary: oldSalary,
      newSalary: increment.newSalary,
      incrementAmount: increment.incrementAmount,
      incrementPercentage: increment.incrementPercentage,
      changeType: increment.incrementType === "PROMOTION_INCREMENT" ? "PROMOTION" : "INCREMENT",
      effectiveDate: increment.effectiveDate || new Date(),
      reason: increment.reason || "Official Salary Increment Approved by Admin",
      approvedBy: req.user.id || req.user._id,
    });

    // 🚀 EXECUTION 3: Publish Event to EmployeeTimeline
    await EmployeeTimeline.logEvent({
      employeeId: employee._id,
      eventType: "SALARY_INCREMENT_APPROVED",
      title: `Salary Revised to ₹${increment.newSalary.toLocaleString()} (+${increment.incrementPercentage}%)`,
      description: `Compensation revised from ₹${oldSalary.toLocaleString()} to ₹${increment.newSalary.toLocaleString()} (+₹${increment.incrementAmount.toLocaleString()}). Effective ${new Date(increment.effectiveDate).toLocaleDateString()}.`,
      category: "INCREMENTS",
      metadata: {
        incrementId: increment._id,
        previousSalary: oldSalary,
        newSalary: increment.newSalary,
        incrementAmount: increment.incrementAmount,
        percentage: increment.incrementPercentage,
      },
      performedBy: req.user.id || req.user._id,
    });

    // 🚀 EXECUTION 4: Write Audit Event to Log Collection
    await Log.create({
      action: "EMPLOYEE_SALARY_INCREMENT_APPROVED",
      performedBy: req.user.id || req.user._id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      affectedResource: "SalaryIncrement",
      resourceId: increment._id,
      previousState: { salary: oldSalary },
      newState: { salary: increment.newSalary },
      details: {
        employeeName: employee.fullName,
        incrementAmount: increment.incrementAmount,
        percentage: increment.incrementPercentage,
        reason: increment.reason,
      },
      status: "SUCCESS",
    });

    // Update SalaryIncrement Proposal Status
    increment.adminApproval = {
      approvedBy: req.user.id || req.user._id,
      approvedAt: new Date(),
      comments: comments || "Salary increment officially approved.",
      approved: true,
    };
    increment.status = "APPROVED";
    increment.historyLog.push({
      action: "INCREMENT_APPROVED",
      performedBy: req.user.id || req.user._id,
      notes: `Salary increment approved by Admin ${req.user.fullName}. New salary: ₹${increment.newSalary.toLocaleString()}`,
    });

    await increment.save();

    // 🚀 EXECUTION 5: Dispatch Notifications
    try {
      await sendNotification({
        recipient: employee.userId || employee._id,
        title: "Salary Revision Approved",
        message: `Your salary revision to ₹${increment.newSalary.toLocaleString()}/yr (+${increment.incrementPercentage}%) has been approved. Effective date: ${new Date(increment.effectiveDate).toLocaleDateString()}.`,
        type: "PAYROLL_UPDATE",
      });
    } catch (notifErr) {
      console.error("Salary increment notification error:", notifErr.message);
    }

    res.status(200).json({
      success: true,
      message: "Salary increment approved and executed successfully",
      data: increment,
    });
  } catch (err) {
    console.error("Error approving salary increment:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Reject salary increment request
// @route   PUT /api/increments/:id/reject
// @access  Private (HR/Admin)
exports.rejectIncrement = async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    const increment = await SalaryIncrement.findById(req.params.id);
    if (!increment) {
      return res.status(404).json({ success: false, message: "Salary increment request not found" });
    }

    if (!["Admin", "HR"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Only HR or Admin can reject salary increments" });
    }

    increment.status = "REJECTED";
    increment.rejectionReason = rejectionReason || "Salary revision proposal declined.";
    increment.historyLog.push({
      action: "INCREMENT_REJECTED",
      performedBy: req.user.id || req.user._id,
      notes: rejectionReason || "Declined by HR/Admin.",
    });

    await increment.save();

    try {
      await sendNotification({
        recipient: increment.requestedBy,
        title: "Salary Increment Request Update",
        message: `Salary increment proposal has been declined: ${rejectionReason || "Please check HR notes."}`,
        type: "PAYROLL_UPDATE",
      });
    } catch (e) {}

    res.status(200).json({
      success: true,
      data: increment,
    });
  } catch (err) {
    console.error("Error rejecting salary increment:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Admin override to reopen salary increment request
// @route   POST /api/increments/:id/reopen
// @access  Private (Admin only)
exports.reopenIncrement = async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ success: false, message: "Only Admin can reopen salary increment requests" });
    }

    const increment = await SalaryIncrement.findById(req.params.id);
    if (!increment) {
      return res.status(404).json({ success: false, message: "Salary increment request not found" });
    }

    increment.status = "PENDING_ADMIN";
    increment.historyLog.push({
      action: "INCREMENT_REOPENED_BY_ADMIN",
      performedBy: req.user.id || req.user._id,
      notes: req.body.reason || "Reopened by Admin for review.",
    });

    await increment.save();

    res.status(200).json({
      success: true,
      data: increment,
    });
  } catch (err) {
    console.error("Error reopening salary increment:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get employee salary history ledger
// @route   GET /api/increments/employee/:employeeId/history
// @access  Private
exports.getEmployeeSalaryHistory = async (req, res) => {
  try {
    const history = await SalaryHistory.find({ employeeId: req.params.employeeId })
      .populate("approvedBy", "fullName email")
      .populate("promotionId", "proposedRole proposedDepartment")
      .populate("reviewId", "finalRecommendation")
      .sort({ effectiveDate: -1 });

    const requests = await SalaryIncrement.find({ employeeId: req.params.employeeId })
      .populate("requestedBy", "fullName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        history,
        requests,
      },
    });
  } catch (err) {
    console.error("Error fetching employee salary history:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get compensation dashboard statistics
// @route   GET /api/increments/stats
// @access  Private (HR/Admin/Manager)
exports.getIncrementStats = async (req, res) => {
  try {
    const totalCount = await SalaryIncrement.countDocuments();
    const pendingHRCount = await SalaryIncrement.countDocuments({ status: "PENDING_HR" });
    const pendingAdminCount = await SalaryIncrement.countDocuments({ status: "PENDING_ADMIN" });
    const approvedCount = await SalaryIncrement.countDocuments({ status: "APPROVED" });
    const rejectedCount = await SalaryIncrement.countDocuments({ status: "REJECTED" });

    // Aggregate YTD Total Salary Increase Budget
    const approvedIncrements = await SalaryIncrement.find({ status: "APPROVED" });
    const totalYTDIncrease = approvedIncrements.reduce((acc, inc) => acc + (inc.incrementAmount || 0), 0);
    const avgPercentage = approvedIncrements.length > 0
      ? (approvedIncrements.reduce((acc, inc) => acc + (inc.incrementPercentage || 0), 0) / approvedIncrements.length).toFixed(1)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        totalCount,
        pendingHRCount,
        pendingAdminCount,
        approvedCount,
        rejectedCount,
        totalYTDIncrease,
        avgPercentage,
      },
    });
  } catch (err) {
    console.error("Error fetching increment stats:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
