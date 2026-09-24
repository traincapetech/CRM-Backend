const ExitRequest = require("../models/ExitRequest");
const Employee = require("../models/Employee");
const Asset = require("../models/Asset");
const EmployeeTimeline = require("../models/EmployeeTimeline");
const Log = require("../models/Log");
const notificationService = require("../services/notificationService");

const DEFAULT_CHECKLIST = [
  { key: "laptop_returned", label: "Laptop & Hardware Returned", isCompleted: false },
  { key: "id_card_returned", label: "Company ID Card Returned", isCompleted: false },
  { key: "access_card_returned", label: "Security Access Card Returned", isCompleted: false },
  { key: "sim_card_returned", label: "Company SIM Card Returned", isCompleted: false },
  { key: "email_archived", label: "Corporate Email & System Access Revoked", isCompleted: false },
  { key: "kt_completed", label: "Knowledge Transfer & Project Handover Completed", isCompleted: false },
  { key: "fnf_cleared", label: "Finance & Payroll Settlement Cleared", isCompleted: false },
];

// Helper to log audit trail
const logAudit = async (action, req, details = {}) => {
  try {
    await Log.create({
      user: req.user._id,
      action,
      category: "HRMS_EXIT",
      details,
      ipAddress: req.ip || "127.0.0.1",
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }
};

// Helper to add timeline event
const addTimelineEvent = async (employeeId, eventType, title, description, createdBy) => {
  try {
    await EmployeeTimeline.create({
      employeeId,
      category: "ASSETS", // Reuse or general timeline category
      title,
      description,
      createdBy,
      metadata: { eventType },
    });
  } catch (err) {
    console.error("Timeline event error:", err);
  }
};

// @desc    Get Exit Dashboard KPIs and activity
// @route   GET /api/exits/dashboard
// @access  Private (Admin, HR)
exports.getExitDashboard = async (req, res) => {
  try {
    const totalActiveExits = await ExitRequest.countDocuments({
      status: { $nin: ["COMPLETED_ARCHIVED", "REJECTED", "WITHDRAWN"] },
    });

    const inNoticePeriod = await ExitRequest.countDocuments({
      status: { $in: ["NOTICE_SUBMITTED", "MANAGER_REVIEW", "HR_VERIFICATION", "CLEARANCE_IN_PROGRESS"] },
    });

    const pendingClearances = await ExitRequest.countDocuments({
      "assetClearance.isCleared": false,
      status: { $in: ["CLEARANCE_IN_PROGRESS", "HR_VERIFICATION"] },
    });

    const pendingSettlements = await ExitRequest.countDocuments({
      "payrollSettlement.status": "PENDING",
      status: { $in: ["SETTLEMENT_PENDING", "CLEARANCE_IN_PROGRESS"] },
    });

    const completedExits = await ExitRequest.countDocuments({
      status: "COMPLETED_ARCHIVED",
    });

    const recentExits = await ExitRequest.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .populate({
        path: "employeeId",
        select: "firstName lastName designation department employeeId photograph photo",
        populate: { path: "department", select: "name" },
      })
      .populate("userId", "fullName email");

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalActiveExits,
          inNoticePeriod,
          pendingClearances,
          pendingSettlements,
          completedExits,
        },
        recentExits,
      },
    });
  } catch (err) {
    console.error("Error fetching exit dashboard:", err);
    res.status(500).json({ success: false, message: "Error fetching exit dashboard", error: err.message });
  }
};

// @desc    List exit requests
// @route   GET /api/exits
// @access  Private (Admin, HR, Manager)
exports.getExits = async (req, res) => {
  try {
    const { status, exitType, search } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (exitType) filter.exitType = exitType;

    // Manager restricted to direct reports unless Admin/HR
    if (!["Admin", "HR"].includes(req.user.role)) {
      const managerEmp = await Employee.findOne({ user: req.user._id });
      if (managerEmp) {
        const directReports = await Employee.find({ reportingManager: managerEmp._id }).select("_id");
        const reportIds = directReports.map((e) => e._id);
        filter.employeeId = { $in: reportIds };
      }
    }

    let exits = await ExitRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate({
        path: "employeeId",
        select: "firstName lastName designation department employeeId joiningDate photograph photo",
        populate: { path: "department", select: "name" },
      })
      .populate("userId", "fullName email");

    if (search) {
      const q = search.toLowerCase();
      exits = exits.filter((e) => {
        const empName = `${e.employeeId?.firstName || ""} ${e.employeeId?.lastName || ""}`.toLowerCase();
        const empCode = (e.employeeId?.employeeId || "").toLowerCase();
        return empName.includes(q) || empCode.includes(q);
      });
    }

    res.status(200).json({
      success: true,
      count: exits.length,
      data: exits,
    });
  } catch (err) {
    console.error("Error fetching exit requests:", err);
    res.status(500).json({ success: false, message: "Error fetching exit requests", error: err.message });
  }
};

// @desc    Submit exit request / resignation
// @route   POST /api/exits
// @access  Private (All Auth)
exports.createExitRequest = async (req, res) => {
  try {
    const { targetEmployeeId, exitType, reason, resignationDate, lastWorkingDay, noticePeriodDays } = req.body;

    let targetEmployee;
    if (targetEmployeeId && ["Admin", "HR"].includes(req.user.role)) {
      targetEmployee = await Employee.findById(targetEmployeeId);
    } else {
      targetEmployee = await Employee.findOne({ user: req.user._id });
    }

    if (!targetEmployee) {
      return res.status(404).json({ success: false, message: "Employee profile not found" });
    }

    // Check if active exit request already exists
    const existingExit = await ExitRequest.findOne({
      employeeId: targetEmployee._id,
      status: { $nin: ["REJECTED", "WITHDRAWN", "COMPLETED_ARCHIVED"] },
    });

    if (existingExit) {
      return res.status(400).json({
        success: false,
        message: "An active exit request is already in progress for this employee",
      });
    }

    const resDate = resignationDate ? new Date(resignationDate) : new Date();
    const lastDay = lastWorkingDay ? new Date(lastWorkingDay) : new Date(Date.now() + 30 * 86400000);
    const noticeDays = noticePeriodDays || 30;

    // Calculate remaining notice days
    const today = new Date();
    const diffTime = Math.max(0, lastDay - today);
    const remainingNoticeDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Check pending assigned assets from Asset Module
    const pendingAssetsCount = await Asset.countDocuments({
      currentAssignee: targetEmployee._id,
      status: "ASSIGNED",
    });

    const newExit = await ExitRequest.create({
      employeeId: targetEmployee._id,
      userId: targetEmployee.user || req.user._id,
      exitType: exitType || "RESIGNATION",
      reason,
      resignationDate: resDate,
      lastWorkingDay: lastDay,
      noticePeriodDays: noticeDays,
      remainingNoticeDays,
      status: "NOTICE_SUBMITTED",
      assetClearance: {
        isCleared: pendingAssetsCount === 0,
        pendingAssetsCount,
      },
      checklist: DEFAULT_CHECKLIST,
      historyLog: [
        {
          action: "NOTICE_SUBMITTED",
          performedBy: req.user._id,
          notes: `Exit request submitted. Type: ${exitType || "RESIGNATION"}`,
          timestamp: new Date(),
        },
      ],
    });

    await addTimelineEvent(
      targetEmployee._id,
      "NOTICE_SUBMITTED",
      "Resignation Submitted",
      `Exit request submitted (${exitType || "RESIGNATION"}). Last working day: ${lastDay.toLocaleDateString()}`,
      req.user._id,
    );

    await logAudit("SUBMIT_EXIT_REQUEST", req, {
      exitRequestId: newExit._id,
      employeeId: targetEmployee._id,
      exitType,
    });

    // Notify Manager & HR
    try {
      await notificationService.notifyAdmins({
        type: "HRMS_EXIT",
        message: `Exit request submitted for ${targetEmployee.firstName} ${targetEmployee.lastName}.`,
        data: { exitId: newExit._id },
      });
    } catch (nErr) {
      console.error("Notification error:", nErr);
    }

    const populated = await ExitRequest.findById(newExit._id)
      .populate("employeeId", "firstName lastName designation department employeeId")
      .populate("userId", "fullName email");

    res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (err) {
    console.error("Error creating exit request:", err);
    res.status(500).json({ success: false, message: "Error creating exit request", error: err.message });
  }
};

// @desc    Get logged in user's exit request
// @route   GET /api/exits/my
// @access  Private (All Auth)
exports.getMyExit = async (req, res) => {
  try {
    const employee = await Employee.findOne({ user: req.user._id });
    if (!employee) {
      return res.status(200).json({ success: true, data: null });
    }

    const exitReq = await ExitRequest.findOne({ employeeId: employee._id })
      .sort({ createdAt: -1 })
      .populate("employeeId", "firstName lastName designation department employeeId joiningDate")
      .populate("userId", "fullName email")
      .populate("knowledgeTransfer.successorId", "firstName lastName designation");

    res.status(200).json({
      success: true,
      data: exitReq,
    });
  } catch (err) {
    console.error("Error fetching my exit:", err);
    res.status(500).json({ success: false, message: "Error fetching exit details", error: err.message });
  }
};

// @desc    Get single exit request with details
// @route   GET /api/exits/:id
// @access  Private (Admin, HR, Manager, Self)
exports.getExitById = async (req, res) => {
  try {
    const exitReq = await ExitRequest.findById(req.params.id)
      .populate({
        path: "employeeId",
        select: "firstName lastName designation department employeeId joiningDate basicSalary photograph photo",
        populate: { path: "department", select: "name" },
      })
      .populate("userId", "fullName email")
      .populate("knowledgeTransfer.successorId", "firstName lastName designation employeeId")
      .populate("managerReview.reviewedBy", "fullName")
      .populate("hrVerification.verifiedBy", "fullName")
      .populate("finalApproval.approvedBy", "fullName");

    if (!exitReq) {
      return res.status(404).json({ success: false, message: "Exit request not found" });
    }

    // Fetch live assigned assets from Asset Module
    const assignedAssets = await Asset.find({
      currentAssignee: exitReq.employeeId._id,
      status: "ASSIGNED",
    }).select("assetCode name serialNumber category condition");

    res.status(200).json({
      success: true,
      data: {
        ...exitReq.toObject(),
        assignedAssets,
      },
    });
  } catch (err) {
    console.error("Error fetching exit request by ID:", err);
    res.status(500).json({ success: false, message: "Error fetching exit details", error: err.message });
  }
};

// @desc    Manager review (approve / reject)
// @route   PUT /api/exits/:id/manager-review
// @access  Private (Admin, HR, Manager)
exports.reviewManagerExit = async (req, res) => {
  try {
    const { action, comments, successorId, handoverDocUrl } = req.body; // action: APPROVED or REJECTED
    const exitReq = await ExitRequest.findById(req.params.id);

    if (!exitReq) {
      return res.status(404).json({ success: false, message: "Exit request not found" });
    }

    exitReq.managerReview = {
      status: action === "APPROVED" ? "APPROVED" : "REJECTED",
      comments: comments || "",
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
    };

    if (action === "APPROVED") {
      exitReq.status = "MANAGER_REVIEW";
      if (successorId) exitReq.knowledgeTransfer.successorId = successorId;
      if (handoverDocUrl) exitReq.knowledgeTransfer.handoverDocUrl = handoverDocUrl;

      exitReq.historyLog.push({
        action: "MANAGER_APPROVED",
        performedBy: req.user._id,
        notes: comments || "Manager approved resignation.",
        timestamp: new Date(),
      });

      await addTimelineEvent(
        exitReq.employeeId,
        "MANAGER_APPROVED",
        "Manager Approval Recorded",
        `Manager approved exit request. Comments: ${comments || "None"}`,
        req.user._id,
      );
    } else {
      exitReq.status = "REJECTED";
      exitReq.historyLog.push({
        action: "MANAGER_REJECTED",
        performedBy: req.user._id,
        notes: comments || "Manager rejected resignation.",
        timestamp: new Date(),
      });
    }

    await exitReq.save();
    await logAudit(`MANAGER_${action}_EXIT`, req, { exitRequestId: exitReq._id });

    res.status(200).json({
      success: true,
      data: exitReq,
    });
  } catch (err) {
    console.error("Error updating manager review:", err);
    res.status(500).json({ success: false, message: "Error updating manager review", error: err.message });
  }
};

// @desc    Update offboarding checklist items
// @route   PUT /api/exits/:id/checklist
// @access  Private (Admin, HR)
exports.updateChecklist = async (req, res) => {
  try {
    const { key, isCompleted } = req.body;
    const exitReq = await ExitRequest.findById(req.params.id);

    if (!exitReq) {
      return res.status(404).json({ success: false, message: "Exit request not found" });
    }

    const itemIndex = exitReq.checklist.findIndex((item) => item.key === key);
    if (itemIndex !== -1) {
      exitReq.checklist[itemIndex].isCompleted = isCompleted;
      exitReq.checklist[itemIndex].updatedBy = req.user._id;
      exitReq.checklist[itemIndex].updatedAt = new Date();
    } else {
      exitReq.checklist.push({
        key,
        label: key,
        isCompleted: !!isCompleted,
        updatedBy: req.user._id,
        updatedAt: new Date(),
      });
    }

    exitReq.historyLog.push({
      action: "CHECKLIST_UPDATED",
      performedBy: req.user._id,
      notes: `Checklist item '${key}' set to ${isCompleted}`,
      timestamp: new Date(),
    });

    await exitReq.save();
    res.status(200).json({ success: true, data: exitReq });
  } catch (err) {
    console.error("Error updating checklist:", err);
    res.status(500).json({ success: false, message: "Error updating checklist", error: err.message });
  }
};

// @desc    Asset clearance sign-off / override
// @route   PUT /api/exits/:id/asset-clearance
// @access  Private (Admin, HR)
exports.updateAssetClearance = async (req, res) => {
  try {
    const { isCleared, overrideReason } = req.body;
    const exitReq = await ExitRequest.findById(req.params.id);

    if (!exitReq) {
      return res.status(404).json({ success: false, message: "Exit request not found" });
    }

    // Check live assets
    const pendingAssetsCount = await Asset.countDocuments({
      currentAssignee: exitReq.employeeId,
      status: "ASSIGNED",
    });

    exitReq.assetClearance = {
      isCleared: isCleared || pendingAssetsCount === 0,
      pendingAssetsCount,
      overrideBy: overrideReason ? req.user._id : null,
      overrideReason: overrideReason || "",
      clearedAt: isCleared ? new Date() : null,
    };

    if (exitReq.status === "MANAGER_REVIEW") {
      exitReq.status = "CLEARANCE_IN_PROGRESS";
    }

    exitReq.historyLog.push({
      action: "ASSET_CLEARANCE_UPDATED",
      performedBy: req.user._id,
      notes: `Asset clearance status: ${isCleared ? "CLEARED" : "PENDING"} (Pending assets: ${pendingAssetsCount})`,
      timestamp: new Date(),
    });

    await addTimelineEvent(
      exitReq.employeeId,
      "ASSET_CLEARED",
      "Asset Clearance Sign-Off",
      `Asset clearance completed. Pending assets: ${pendingAssetsCount}`,
      req.user._id,
    );

    await exitReq.save();
    res.status(200).json({ success: true, data: exitReq });
  } catch (err) {
    console.error("Error updating asset clearance:", err);
    res.status(500).json({ success: false, message: "Error updating asset clearance", error: err.message });
  }
};

// @desc    Calculate & update FnF Settlement (Leave encashment + pending salary)
// @route   PUT /api/exits/:id/fnf-settlement
// @access  Private (Admin, HR)
exports.updateFnFSettlement = async (req, res) => {
  try {
    const {
      earnedLeaveBalance,
      encashableDays,
      dailyRate,
      pendingSalary,
      reimbursements,
      deductions,
      noticeBuyoutAmount,
    } = req.body;

    const exitReq = await ExitRequest.findById(req.params.id).populate("employeeId");
    if (!exitReq) {
      return res.status(404).json({ success: false, message: "Exit request not found" });
    }

    const empSalary = exitReq.employeeId?.basicSalary || 30000;
    const calculatedDailyRate = dailyRate || Math.round(empSalary / 30);
    const totalEncashment = (encashableDays || 0) * calculatedDailyRate;

    const netTotal =
      (pendingSalary || 0) +
      totalEncashment +
      (reimbursements || 0) -
      (deductions || 0) -
      (noticeBuyoutAmount || 0);

    exitReq.leaveSettlement = {
      earnedLeaveBalance: earnedLeaveBalance || 0,
      usedLeave: (earnedLeaveBalance || 0) - (encashableDays || 0),
      encashableDays: encashableDays || 0,
      dailyRate: calculatedDailyRate,
      totalEncashmentAmount: totalEncashment,
    };

    exitReq.payrollSettlement = {
      pendingSalary: pendingSalary || 0,
      reimbursements: reimbursements || 0,
      deductions: deductions || 0,
      noticeBuyoutAmount: noticeBuyoutAmount || 0,
      finalSettlementTotal: netTotal,
      status: "PROCESSED",
      processedAt: new Date(),
    };

    exitReq.status = "SETTLEMENT_PENDING";

    exitReq.historyLog.push({
      action: "FNF_SETTLED",
      performedBy: req.user._id,
      notes: `Full & Final Settlement calculated. Total Net Payout: ₹${netTotal}`,
      timestamp: new Date(),
    });

    await addTimelineEvent(
      exitReq.employeeId._id,
      "FNF_SETTLED",
      "Full & Final Settlement Processed",
      `FnF settlement total calculated: ₹${netTotal} (Encashment: ₹${totalEncashment})`,
      req.user._id,
    );

    await exitReq.save();
    res.status(200).json({ success: true, data: exitReq });
  } catch (err) {
    console.error("Error updating FnF settlement:", err);
    res.status(500).json({ success: false, message: "Error updating FnF settlement", error: err.message });
  }
};

// @desc    Record Exit Interview feedback
// @route   POST /api/exits/:id/exit-interview
// @access  Private (Admin, HR)
exports.recordExitInterview = async (req, res) => {
  try {
    const { feedback, reasonCategory, suggestions, rehireEligible, hrNotes } = req.body;
    const exitReq = await ExitRequest.findById(req.params.id);

    if (!exitReq) {
      return res.status(404).json({ success: false, message: "Exit request not found" });
    }

    exitReq.exitInterview = {
      feedback: feedback || "",
      reasonCategory: reasonCategory || "Better Opportunity",
      suggestions: suggestions || "",
      rehireEligible: rehireEligible !== undefined ? rehireEligible : true,
      hrNotes: hrNotes || "",
    };

    exitReq.historyLog.push({
      action: "EXIT_INTERVIEW_RECORDED",
      performedBy: req.user._id,
      notes: `Exit interview recorded. Category: ${reasonCategory}, Rehire Eligible: ${rehireEligible}`,
      timestamp: new Date(),
    });

    await exitReq.save();
    res.status(200).json({ success: true, data: exitReq });
  } catch (err) {
    console.error("Error recording exit interview:", err);
    res.status(500).json({ success: false, message: "Error recording exit interview", error: err.message });
  }
};

// @desc    Final Admin Approval & Employee Archival
// @route   PUT /api/exits/:id/final-approve
// @access  Private (Admin)
exports.finalApproveExit = async (req, res) => {
  try {
    const { comments } = req.body;
    const exitReq = await ExitRequest.findById(req.params.id).populate("employeeId");

    if (!exitReq) {
      return res.status(404).json({ success: false, message: "Exit request not found" });
    }

    if (req.user.role !== "Admin") {
      return res.status(403).json({ success: false, message: "Only Admin can give final exit approval" });
    }

    exitReq.finalApproval = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
      comments: comments || "Final exit approved by Admin.",
    };

    exitReq.status = "COMPLETED_ARCHIVED";

    exitReq.historyLog.push({
      action: "COMPLETED_ARCHIVED",
      performedBy: req.user._id,
      notes: "Exit finalized and employee archived.",
      timestamp: new Date(),
    });

    await exitReq.save();

    // UPDATE EMPLOYEE STATUS TO "EXITED" (Preserve all historical records)
    if (exitReq.employeeId) {
      await Employee.findByIdAndUpdate(exitReq.employeeId._id, {
        status: "EXITED",
        leavingDate: exitReq.lastWorkingDay,
      });

      await addTimelineEvent(
        exitReq.employeeId._id,
        "EMPLOYEE_ARCHIVED",
        "Employee Offboarded & Archived",
        `Final exit completed. Employee status set to EXITED on ${new Date().toLocaleDateString()}.`,
        req.user._id,
      );
    }

    await logAudit("FINAL_APPROVE_EXIT", req, { exitRequestId: exitReq._id, employeeId: exitReq.employeeId._id });

    // Send notifications
    try {
      await notificationService.notifyAdmins({
        type: "HRMS_EXIT",
        message: `Exit process finalized for ${exitReq.employeeId?.firstName} ${exitReq.employeeId?.lastName}. Employee archived.`,
        data: { exitId: exitReq._id },
      });
    } catch (nErr) {
      console.error("Notification error:", nErr);
    }

    res.status(200).json({
      success: true,
      data: exitReq,
    });
  } catch (err) {
    console.error("Error finalizing exit approval:", err);
    res.status(500).json({ success: false, message: "Error finalizing exit approval", error: err.message });
  }
};

// @desc    Withdraw exit request
// @route   POST /api/exits/:id/withdraw
// @access  Private (Self, Admin)
exports.withdrawExit = async (req, res) => {
  try {
    const exitReq = await ExitRequest.findById(req.params.id);
    if (!exitReq) {
      return res.status(404).json({ success: false, message: "Exit request not found" });
    }

    exitReq.status = "WITHDRAWN";
    exitReq.historyLog.push({
      action: "WITHDRAWN",
      performedBy: req.user._id,
      notes: "Resignation withdrawn.",
      timestamp: new Date(),
    });

    await exitReq.save();
    res.status(200).json({ success: true, data: exitReq });
  } catch (err) {
    console.error("Error withdrawing exit request:", err);
    res.status(500).json({ success: false, message: "Error withdrawing exit request", error: err.message });
  }
};
