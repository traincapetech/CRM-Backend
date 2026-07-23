const PromotionRequest = require("../models/PromotionRequest");
const Employee = require("../models/Employee");
const User = require("../models/User");
const Department = require("../models/Department");
const EmployeeRole = require("../models/EmployeeRole");
const EmploymentHistory = require("../models/EmploymentHistory");
const EmployeeTimeline = require("../models/EmployeeTimeline");
const Log = require("../models/Log");
const PerformanceReview = require("../models/PerformanceReview");
const { sendNotification, notifyAdmins } = require("../services/notificationService");

// @desc    Create promotion request
// @route   POST /api/promotions
// @access  Private (Manager/HR/Admin)
exports.createPromotionRequest = async (req, res) => {
  try {
    const {
      employeeId,
      promotionType,
      proposedRole,
      proposedDepartment,
      proposedReportingManager,
      proposedEmploymentType,
      proposedCareerLevel,
      proposedSalaryRecommendation,
      effectiveDate,
      businessJustification,
      reviewId,
      notes,
    } = req.body;

    const employee = await Employee.findById(employeeId)
      .populate("department")
      .populate("role")
      .populate("reportingManager");

    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    const initialStatus = req.user.role === "Admin" ? "PENDING_ADMIN" : "PENDING_HR";

    const promotion = await PromotionRequest.create({
      employeeId: employee._id,
      userId: employee.userId || employee._id,
      promotionType: promotionType || "DESIGNATION_PROMOTION",

      // Snapshot Current State
      currentRole: employee.role?._id || employee.role || null,
      currentDepartment: employee.department?._id || employee.department || null,
      currentReportingManager: employee.reportingManager?._id || employee.reportingManager || null,
      currentEmploymentType: employee.employmentType || "Permanent",
      currentCareerLevel: employee.careerLevel || "L1 - Junior",

      // Proposed State
      proposedRole,
      proposedDepartment,
      proposedReportingManager: proposedReportingManager || employee.reportingManager?._id || null,
      proposedEmploymentType: proposedEmploymentType || employee.employmentType || "Permanent",
      proposedCareerLevel: proposedCareerLevel || "L2 - Mid",
      proposedSalaryRecommendation: proposedSalaryRecommendation ? Number(proposedSalaryRecommendation) : null,

      effectiveDate: effectiveDate || new Date(),
      businessJustification,
      reviewId: reviewId || null,
      notes: notes || "",
      status: initialStatus,
      requestedBy: req.user.id || req.user._id,
      historyLog: [
        {
          action: "PROMOTION_REQUESTED",
          performedBy: req.user.id || req.user._id,
          notes: `Promotion request created by ${req.user.fullName || "User"}.`,
        },
      ],
    });

    await notifyAdmins({
      type: "PROMOTION_REQUESTED",
      message: `Promotion request initiated for ${employee.fullName} by ${req.user.fullName}. Status: ${initialStatus}`,
    });

    res.status(201).json({
      success: true,
      data: promotion,
    });
  } catch (err) {
    console.error("Error creating promotion request:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get promotion requests list
// @route   GET /api/promotions
// @access  Private
exports.getPromotions = async (req, res) => {
  try {
    let query = {};
    if (["Admin", "HR"].includes(req.user.role)) {
      query = {};
    } else if (req.user.role === "Manager") {
      // Find direct reporting employees
      const myEmployees = await Employee.find({ reportingManager: req.user.id }).select("_id");
      const empIds = myEmployees.map((e) => e._id);
      query = { $or: [{ employeeId: { $in: empIds } }, { requestedBy: req.user.id }] };
    } else {
      query = { userId: req.user.id };
    }

    const promotions = await PromotionRequest.find(query)
      .populate("employeeId", "fullName email profilePicture photo photograph department role")
      .populate("userId", "fullName email profilePicture")
      .populate("currentRole", "name")
      .populate("currentDepartment", "name")
      .populate("currentReportingManager", "fullName email")
      .populate("proposedRole", "name")
      .populate("proposedDepartment", "name")
      .populate("proposedReportingManager", "fullName email")
      .populate("requestedBy", "fullName email role")
      .populate("reviewId", "finalRecommendation managerReview")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: promotions.length,
      data: promotions,
    });
  } catch (err) {
    console.error("Error fetching promotions:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get employee's own promotions
// @route   GET /api/promotions/my-promotions
// @access  Private
exports.getMyPromotions = async (req, res) => {
  try {
    const promotions = await PromotionRequest.find({ userId: req.user.id })
      .populate("currentRole", "name")
      .populate("currentDepartment", "name")
      .populate("proposedRole", "name")
      .populate("proposedDepartment", "name")
      .populate("requestedBy", "fullName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: promotions.length,
      data: promotions,
    });
  } catch (err) {
    console.error("Error fetching my promotions:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get single promotion by ID
// @route   GET /api/promotions/:id
// @access  Private
exports.getPromotionById = async (req, res) => {
  try {
    const promotion = await PromotionRequest.findById(req.params.id)
      .populate("employeeId")
      .populate("userId", "fullName email profilePicture")
      .populate("currentRole", "name description")
      .populate("currentDepartment", "name")
      .populate("currentReportingManager", "fullName email role")
      .populate("proposedRole", "name description")
      .populate("proposedDepartment", "name")
      .populate("proposedReportingManager", "fullName email role")
      .populate("requestedBy", "fullName email role")
      .populate("hrVerification.verifiedBy", "fullName email")
      .populate("adminApproval.approvedBy", "fullName email")
      .populate("reviewId")
      .populate("historyLog.performedBy", "fullName email role");

    if (!promotion) {
      return res.status(404).json({ success: false, message: "Promotion request not found" });
    }

    res.status(200).json({
      success: true,
      data: promotion,
    });
  } catch (err) {
    console.error("Error fetching promotion details:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    HR verification step
// @route   PUT /api/promotions/:id/verify
// @access  Private (HR/Admin)
exports.verifyPromotion = async (req, res) => {
  try {
    const { comments } = req.body;

    const promotion = await PromotionRequest.findById(req.params.id);
    if (!promotion) {
      return res.status(404).json({ success: false, message: "Promotion request not found" });
    }

    if (!["Admin", "HR"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Only HR or Admin can verify promotions" });
    }

    promotion.hrVerification = {
      verifiedBy: req.user.id || req.user._id,
      verifiedAt: new Date(),
      comments: comments || "HR verification completed.",
      verified: true,
    };

    promotion.status = "PENDING_ADMIN";
    promotion.historyLog.push({
      action: "HR_VERIFIED",
      performedBy: req.user.id || req.user._id,
      notes: comments || "HR verified promotion request.",
    });

    await promotion.save();

    await notifyAdmins({
      type: "PROMOTION_HR_VERIFIED",
      message: `Promotion request verified by HR (${req.user.fullName}). Awaiting Admin final approval.`,
    });

    res.status(200).json({
      success: true,
      data: promotion,
    });
  } catch (err) {
    console.error("Error verifying promotion:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Final Admin approval & promotion execution
// @route   PUT /api/promotions/:id/approve
// @access  Private (Admin only)
exports.approvePromotion = async (req, res) => {
  try {
    const { comments } = req.body;

    if (req.user.role !== "Admin") {
      return res.status(403).json({ success: false, message: "Only Admin can give final promotion approval" });
    }

    const promotion = await PromotionRequest.findById(req.params.id)
      .populate("employeeId")
      .populate("proposedRole")
      .populate("proposedDepartment")
      .populate("proposedReportingManager")
      .populate("currentRole")
      .populate("currentDepartment")
      .populate("currentReportingManager");

    if (!promotion) {
      return res.status(404).json({ success: false, message: "Promotion request not found" });
    }

    if (promotion.status === "APPROVED") {
      return res.status(400).json({ success: false, message: "Promotion is already approved" });
    }

    const employee = await Employee.findById(promotion.employeeId._id || promotion.employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: "Target employee record not found" });
    }

    // 🚀 EXECUTION 1: Update Employee Document
    const oldRoleText = promotion.currentRole?.name || "Previous Role";
    const oldDeptText = promotion.currentDepartment?.name || "Previous Dept";
    const oldManagerText = promotion.currentReportingManager?.fullName || "None";
    const oldEmpType = employee.employmentType || "Permanent";

    const newRoleText = promotion.proposedRole?.name || "New Role";
    const newDeptText = promotion.proposedDepartment?.name || "New Dept";
    const newManagerText = promotion.proposedReportingManager?.fullName || "None";

    employee.role = promotion.proposedRole._id || promotion.proposedRole;
    employee.department = promotion.proposedDepartment._id || promotion.proposedDepartment;
    if (promotion.proposedReportingManager) {
      employee.reportingManager = promotion.proposedReportingManager._id || promotion.proposedReportingManager;
    }
    if (promotion.proposedEmploymentType) {
      employee.employmentType = promotion.proposedEmploymentType;
    }
    await employee.save();

    // 🚀 EXECUTION 2: Record Immutable EmploymentHistory Entries
    // Designation Promotion History
    await EmploymentHistory.create({
      employeeId: employee._id,
      changeType: "PROMOTION",
      fieldName: "role",
      previousValue: promotion.currentRole?._id || null,
      newValue: promotion.proposedRole._id || promotion.proposedRole,
      previousValueText: oldRoleText,
      newValueText: newRoleText,
      effectiveDate: promotion.effectiveDate || new Date(),
      changedBy: req.user.id || req.user._id,
      reason: promotion.businessJustification || "Official Promotion Approved by Admin",
    });

    // Department Transfer History (if department changed)
    if (promotion.currentDepartment?.toString() !== promotion.proposedDepartment?._id?.toString()) {
      await EmploymentHistory.create({
        employeeId: employee._id,
        changeType: "DEPARTMENT_TRANSFER",
        fieldName: "department",
        previousValue: promotion.currentDepartment?._id || null,
        newValue: promotion.proposedDepartment._id || promotion.proposedDepartment,
        previousValueText: oldDeptText,
        newValueText: newDeptText,
        effectiveDate: promotion.effectiveDate || new Date(),
        changedBy: req.user.id || req.user._id,
        reason: promotion.businessJustification || "Department Transfer via Promotion",
      });
    }

    // Manager History (if manager changed)
    if (promotion.proposedReportingManager && promotion.currentReportingManager?.toString() !== promotion.proposedReportingManager?._id?.toString()) {
      await EmploymentHistory.create({
        employeeId: employee._id,
        changeType: "REPORTING_MANAGER",
        fieldName: "reportingManager",
        previousValue: promotion.currentReportingManager?._id || null,
        newValue: promotion.proposedReportingManager._id || promotion.proposedReportingManager,
        previousValueText: oldManagerText,
        newValueText: newManagerText,
        effectiveDate: promotion.effectiveDate || new Date(),
        changedBy: req.user.id || req.user._id,
        reason: promotion.businessJustification || "Reporting Manager update via Promotion",
      });
    }

    // 🚀 EXECUTION 3: Publish Event to EmployeeTimeline
    await EmployeeTimeline.logEvent({
      employeeId: employee._id,
      eventType: "PROMOTION_APPROVED",
      title: `Promoted to ${newRoleText}`,
      description: `Officially promoted from ${oldRoleText} (${oldDeptText}) to ${newRoleText} (${newDeptText}). Effective ${new Date(promotion.effectiveDate).toLocaleDateString()}.`,
      category: "EMPLOYMENT",
      metadata: {
        promotionId: promotion._id,
        oldRole: oldRoleText,
        newRole: newRoleText,
        oldDepartment: oldDeptText,
        newDepartment: newDeptText,
        salaryRecommendation: promotion.proposedSalaryRecommendation,
      },
      performedBy: req.user.id || req.user._id,
    });

    // 🚀 EXECUTION 4: Write Audit Log Entry
    await Log.create({
      action: "EMPLOYEE_PROMOTION_APPROVED",
      performedBy: req.user.id || req.user._id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      affectedResource: "PromotionRequest",
      resourceId: promotion._id,
      previousState: { role: oldRoleText, department: oldDeptText, manager: oldManagerText },
      newState: { role: newRoleText, department: newDeptText, manager: newManagerText },
      details: {
        employeeName: employee.fullName,
        isAdminOverride: true,
        justification: promotion.businessJustification,
      },
      status: "SUCCESS",
    });

    // Update Promotion Request Status
    promotion.adminApproval = {
      approvedBy: req.user.id || req.user._id,
      approvedAt: new Date(),
      comments: comments || "Promotion officially approved.",
      approved: true,
    };
    promotion.status = "APPROVED";
    promotion.historyLog.push({
      action: "PROMOTION_APPROVED",
      performedBy: req.user.id || req.user._id,
      notes: `Promotion officially approved by Admin ${req.user.fullName}.`,
    });

    await promotion.save();

    // 🚀 EXECUTION 5: Dispatch Notifications
    try {
      await sendNotification({
        recipient: employee.userId || employee._id,
        title: "Congratulations on your Promotion!",
        message: `Your promotion to ${newRoleText} in ${newDeptText} has been officially approved. Effective date: ${new Date(promotion.effectiveDate).toLocaleDateString()}.`,
        type: "EMPLOYMENT_UPDATE",
      });
      if (promotion.currentReportingManager) {
        await sendNotification({
          recipient: promotion.currentReportingManager._id || promotion.currentReportingManager,
          title: "Team Member Promoted",
          message: `Promotion request for ${employee.fullName} to ${newRoleText} has been approved.`,
          type: "EMPLOYMENT_UPDATE",
        });
      }
    } catch (notifErr) {
      console.error("Promotion approval notification error:", notifErr.message);
    }

    res.status(200).json({
      success: true,
      message: "Promotion approved and executed successfully",
      data: promotion,
    });
  } catch (err) {
    console.error("Error approving promotion:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Reject promotion request
// @route   PUT /api/promotions/:id/reject
// @access  Private (HR/Admin)
exports.rejectPromotion = async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    const promotion = await PromotionRequest.findById(req.params.id);
    if (!promotion) {
      return res.status(404).json({ success: false, message: "Promotion request not found" });
    }

    if (!["Admin", "HR"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Only HR or Admin can reject promotion requests" });
    }

    promotion.status = "REJECTED";
    promotion.rejectionReason = rejectionReason || "Promotion proposal rejected.";
    promotion.historyLog.push({
      action: "PROMOTION_REJECTED",
      performedBy: req.user.id || req.user._id,
      notes: rejectionReason || "Rejected by HR/Admin.",
    });

    await promotion.save();

    try {
      await sendNotification({
        recipient: promotion.requestedBy,
        title: "Promotion Request Update",
        message: `Promotion request for employee has been declined: ${rejectionReason || "Please check HR notes."}`,
        type: "EMPLOYMENT_UPDATE",
      });
    } catch (e) {}

    res.status(200).json({
      success: true,
      data: promotion,
    });
  } catch (err) {
    console.error("Error rejecting promotion:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Admin override to reopen promotion request
// @route   POST /api/promotions/:id/reopen
// @access  Private (Admin only)
exports.reopenPromotion = async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ success: false, message: "Only Admin can reopen promotion requests" });
    }

    const promotion = await PromotionRequest.findById(req.params.id);
    if (!promotion) {
      return res.status(404).json({ success: false, message: "Promotion request not found" });
    }

    promotion.status = "PENDING_ADMIN";
    promotion.historyLog.push({
      action: "PROMOTION_REOPENED_BY_ADMIN",
      performedBy: req.user.id || req.user._id,
      notes: req.body.reason || "Reopened by Admin for review.",
    });

    await promotion.save();

    res.status(200).json({
      success: true,
      data: promotion,
    });
  } catch (err) {
    console.error("Error reopening promotion:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get employee promotion & career progression history
// @route   GET /api/promotions/employee/:employeeId/history
// @access  Private
exports.getEmployeePromotionHistory = async (req, res) => {
  try {
    const promotions = await PromotionRequest.find({
      employeeId: req.params.employeeId,
      status: "APPROVED",
    })
      .populate("currentRole", "name")
      .populate("proposedRole", "name")
      .populate("currentDepartment", "name")
      .populate("proposedDepartment", "name")
      .populate("adminApproval.approvedBy", "fullName email")
      .sort({ effectiveDate: -1 });

    res.status(200).json({
      success: true,
      count: promotions.length,
      data: promotions,
    });
  } catch (err) {
    console.error("Error fetching employee promotion history:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get promotion dashboard statistics
// @route   GET /api/promotions/stats
// @access  Private (HR/Admin/Manager)
exports.getPromotionStats = async (req, res) => {
  try {
    const totalCount = await PromotionRequest.countDocuments();
    const pendingHRCount = await PromotionRequest.countDocuments({ status: "PENDING_HR" });
    const pendingAdminCount = await PromotionRequest.countDocuments({ status: "PENDING_ADMIN" });
    const approvedCount = await PromotionRequest.countDocuments({ status: "APPROVED" });
    const rejectedCount = await PromotionRequest.countDocuments({ status: "REJECTED" });

    res.status(200).json({
      success: true,
      data: {
        totalCount,
        pendingHRCount,
        pendingAdminCount,
        approvedCount,
        rejectedCount,
      },
    });
  } catch (err) {
    console.error("Error fetching promotion stats:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
