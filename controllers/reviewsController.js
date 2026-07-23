const ReviewCycle = require("../models/ReviewCycle");
const ReviewTemplate = require("../models/ReviewTemplate");
const PerformanceReview = require("../models/PerformanceReview");
const Employee = require("../models/Employee");
const User = require("../models/User");
const PerformanceSummary = require("../models/PerformanceSummary");
const EmployeeTimeline = require("../models/EmployeeTimeline");
const Log = require("../models/Log");
const { sendNotification, notifyAdmins } = require("../services/notificationService");

// @desc    Get review templates
// @route   GET /api/reviews/templates
// @access  Private
exports.getTemplates = async (req, res) => {
  try {
    let templates = await ReviewTemplate.find({ isActive: true }).sort({ createdAt: -1 });

    // Seed default template if none exists
    if (templates.length === 0) {
      const defaultTemplate = await ReviewTemplate.create({
        title: "Standard Enterprise Performance Appraisal Template",
        description: "Default multi-rater evaluation template for performance reviews.",
        sections: ReviewTemplate.getDefaultSections(),
        selfReviewQuestions: ReviewTemplate.getDefaultSelfReviewQuestions(),
        createdBy: req.user.id || req.user._id,
      });
      templates = [defaultTemplate];
    }

    res.status(200).json({
      success: true,
      count: templates.length,
      data: templates,
    });
  } catch (err) {
    console.error("Error fetching review templates:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Create review template
// @route   POST /api/reviews/templates
// @access  Private (HR/Admin)
exports.createTemplate = async (req, res) => {
  try {
    const { title, description, sections, selfReviewQuestions } = req.body;

    const template = await ReviewTemplate.create({
      title,
      description,
      sections: sections || ReviewTemplate.getDefaultSections(),
      selfReviewQuestions: selfReviewQuestions || ReviewTemplate.getDefaultSelfReviewQuestions(),
      createdBy: req.user.id || req.user._id,
    });

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (err) {
    console.error("Error creating review template:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get review cycles
// @route   GET /api/reviews/cycles
// @access  Private
exports.getCycles = async (req, res) => {
  try {
    const cycles = await ReviewCycle.find()
      .populate("templateId", "title description")
      .populate("targetDepartments", "name")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: cycles.length,
      data: cycles,
    });
  } catch (err) {
    console.error("Error fetching review cycles:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Create review cycle and initialize employee reviews
// @route   POST /api/reviews/cycles
// @access  Private (HR/Admin)
exports.createCycle = async (req, res) => {
  try {
    const { title, frequency, startDate, endDate, dueDate, templateId, targetDepartments } = req.body;

    let selectedTemplateId = templateId;
    if (!selectedTemplateId) {
      const defaultTmpl = await ReviewTemplate.findOne({ isActive: true });
      if (defaultTmpl) {
        selectedTemplateId = defaultTmpl._id;
      } else {
        const created = await ReviewTemplate.create({
          title: "Standard Enterprise Performance Appraisal Template",
          description: "Default template",
          sections: ReviewTemplate.getDefaultSections(),
          selfReviewQuestions: ReviewTemplate.getDefaultSelfReviewQuestions(),
          createdBy: req.user.id || req.user._id,
        });
        selectedTemplateId = created._id;
      }
    }

    const cycle = await ReviewCycle.create({
      title,
      frequency: frequency || "QUARTERLY",
      startDate,
      endDate,
      dueDate,
      templateId: selectedTemplateId,
      targetDepartments: targetDepartments || [],
      createdBy: req.user.id || req.user._id,
      status: "ACTIVE",
    });

    // Fetch target employees
    let employeeQuery = { status: { $in: ["ACTIVE", "PROBATION", "ONBOARDING"] } };
    if (targetDepartments && targetDepartments.length > 0) {
      employeeQuery.department = { $in: targetDepartments };
    }

    const eligibleEmployees = await Employee.find(employeeQuery);

    let reviewsCreated = 0;
    for (const emp of eligibleEmployees) {
      if (!emp.userId) continue;

      // Check if review already exists for this employee in this cycle
      const existing = await PerformanceReview.findOne({
        reviewCycleId: cycle._id,
        employeeId: emp._id,
      });

      if (!existing) {
        await PerformanceReview.create({
          reviewCycleId: cycle._id,
          templateId: selectedTemplateId,
          employeeId: emp._id,
          userId: emp.userId,
          managerId: emp.reportingManager || null,
          status: "SELF_REVIEW_PENDING",
          historyLog: [
            {
              action: "CYCLE_INITIALIZED",
              performedBy: req.user.id || req.user._id,
              notes: `Review cycle "${cycle.title}" started.`,
            },
          ],
        });

        reviewsCreated++;

        // Notify employee
        try {
          await sendNotification({
            recipient: emp.userId,
            title: "Performance Review Started",
            message: `Your ${cycle.title} performance review is now active. Please submit your self-evaluation before ${new Date(dueDate).toLocaleDateString()}.`,
            type: "PERFORMANCE_REVIEW",
          });
        } catch (notifErr) {
          console.error("Notification failed for user:", emp.userId, notifErr.message);
        }
      }
    }

    await notifyAdmins({
      type: "REVIEW_CYCLE_CREATED",
      message: `Review cycle "${cycle.title}" launched by ${req.user.fullName}. Initialized ${reviewsCreated} employee appraisals.`,
    });

    res.status(201).json({
      success: true,
      data: cycle,
      reviewsCreated,
    });
  } catch (err) {
    console.error("Error creating review cycle:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get employee's own reviews
// @route   GET /api/reviews/my-reviews
// @access  Private
exports.getMyReviews = async (req, res) => {
  try {
    const reviews = await PerformanceReview.find({ userId: req.user.id })
      .populate("reviewCycleId", "title frequency startDate endDate dueDate status")
      .populate("templateId", "title sections selfReviewQuestions")
      .populate("managerId", "fullName email role")
      .populate("hrId", "fullName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (err) {
    console.error("Error fetching my reviews:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get manager's team reviews
// @route   GET /api/reviews/team-reviews
// @access  Private (Manager/Admin/HR)
exports.getTeamReviews = async (req, res) => {
  try {
    let query = {};
    if (["Admin", "HR"].includes(req.user.role)) {
      query = {};
    } else {
      query = { managerId: req.user.id };
    }

    const reviews = await PerformanceReview.find(query)
      .populate("reviewCycleId", "title frequency startDate endDate dueDate status")
      .populate("templateId", "title sections selfReviewQuestions")
      .populate("employeeId", "fullName email department role photo photograph")
      .populate("userId", "fullName email profilePicture")
      .populate("managerId", "fullName email role")
      .populate("hrId", "fullName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (err) {
    console.error("Error fetching team reviews:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get all reviews (HR/Admin view)
// @route   GET /api/reviews/all
// @access  Private (HR/Admin)
exports.getAllReviews = async (req, res) => {
  try {
    const reviews = await PerformanceReview.find()
      .populate("reviewCycleId", "title frequency startDate endDate dueDate status")
      .populate("templateId", "title sections selfReviewQuestions")
      .populate("employeeId", "fullName email department role photo photograph")
      .populate("userId", "fullName email profilePicture")
      .populate("managerId", "fullName email role")
      .populate("hrId", "fullName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (err) {
    console.error("Error fetching all reviews:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get single review details
// @route   GET /api/reviews/:id
// @access  Private
exports.getReviewById = async (req, res) => {
  try {
    const review = await PerformanceReview.findById(req.params.id)
      .populate("reviewCycleId", "title frequency startDate endDate dueDate status")
      .populate("templateId", "title description sections selfReviewQuestions")
      .populate("employeeId", "fullName email department role photo photograph")
      .populate("userId", "fullName email profilePicture")
      .populate("managerId", "fullName email role")
      .populate("hrId", "fullName email")
      .populate("historyLog.performedBy", "fullName email role");

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (err) {
    console.error("Error fetching review by ID:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Employee submits self review
// @route   PUT /api/reviews/:id/self-review
// @access  Private (Employee)
exports.submitSelfReview = async (req, res) => {
  try {
    const { answers, overallComments } = req.body;

    const review = await PerformanceReview.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    // Verify employee authorization
    if (review.userId.toString() !== req.user.id && req.user.role !== "Admin") {
      return res.status(403).json({ success: false, message: "Not authorized to submit self-review for this employee" });
    }

    review.selfReview = {
      submittedAt: new Date(),
      answers: answers || [],
      overallComments: overallComments || "",
    };

    review.status = "MANAGER_REVIEW_PENDING";
    review.historyLog.push({
      action: "SELF_REVIEW_SUBMITTED",
      performedBy: req.user.id || req.user._id,
      notes: "Employee submitted self-evaluation.",
    });

    await review.save();

    // Notify manager if assigned
    if (review.managerId) {
      try {
        await sendNotification({
          recipient: review.managerId,
          title: "Self-Review Submitted",
          message: `Self-evaluation submitted for performance review. Please complete manager appraisal.`,
          type: "PERFORMANCE_REVIEW",
        });
      } catch (notifErr) {
        console.error("Manager notification failed:", notifErr.message);
      }
    }

    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (err) {
    console.error("Error submitting self review:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Manager submits evaluation
// @route   PUT /api/reviews/:id/manager-review
// @access  Private (Manager/Admin/HR)
exports.submitManagerReview = async (req, res) => {
  try {
    const { sectionRatings, overallRating, summaryFeedback, strengths, areasForGrowth } = req.body;

    const review = await PerformanceReview.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    // Authorization check
    if (
      !["Admin", "HR"].includes(req.user.role) &&
      review.managerId?.toString() !== req.user.id
    ) {
      return res.status(403).json({ success: false, message: "Not authorized to submit manager evaluation for this employee" });
    }

    // Self-approval safeguard
    if (review.userId.toString() === req.user.id && req.user.role !== "Admin") {
      return res.status(403).json({ success: false, message: "Employees cannot evaluate their own manager review" });
    }

    review.managerReview = {
      submittedAt: new Date(),
      evaluatorId: req.user.id || req.user._id,
      sectionRatings: sectionRatings || [],
      overallRating: Number(overallRating) || 3,
      summaryFeedback: summaryFeedback || "",
      strengths: strengths || "",
      areasForGrowth: areasForGrowth || "",
    };

    review.status = "HR_REVIEW_PENDING";
    review.historyLog.push({
      action: "MANAGER_REVIEW_SUBMITTED",
      performedBy: req.user.id || req.user._id,
      notes: `Manager evaluation submitted with overall rating ${overallRating}/5.`,
    });

    await review.save();

    await notifyAdmins({
      type: "MANAGER_REVIEW_COMPLETED",
      message: `Manager review completed by ${req.user.fullName} for evaluation ID: ${review._id}`,
    });

    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (err) {
    console.error("Error submitting manager review:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    HR review & policy validation (or return for revision)
// @route   PUT /api/reviews/:id/hr-review
// @access  Private (HR/Admin)
exports.submitHRReview = async (req, res) => {
  try {
    const { attendanceScore, policyCompliance, trainingCompletion, hrComments, returnForRevision, revisionNotes } = req.body;

    const review = await PerformanceReview.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    if (!["Admin", "HR"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Only HR or Admin can validate reviews" });
    }

    if (returnForRevision) {
      review.status = "REVISION_REQUIRED";
      review.hrReview = {
        reviewedAt: new Date(),
        reviewerId: req.user.id || req.user._id,
        revisionNotes: revisionNotes || "HR requested revision on evaluation.",
      };
      review.historyLog.push({
        action: "RETURNED_FOR_REVISION",
        performedBy: req.user.id || req.user._id,
        notes: revisionNotes || "HR requested revision on evaluation.",
      });
      await review.save();

      if (review.managerId) {
        try {
          await sendNotification({
            recipient: review.managerId,
            title: "Review Returned for Revision",
            message: `HR requested revision for performance review: ${revisionNotes || "Please review feedback."}`,
            type: "PERFORMANCE_REVIEW",
          });
        } catch (e) {}
      }

      return res.status(200).json({
        success: true,
        message: "Review returned for revision",
        data: review,
      });
    }

    review.hrId = req.user.id || req.user._id;
    review.hrReview = {
      reviewedAt: new Date(),
      reviewerId: req.user.id || req.user._id,
      attendanceScore: attendanceScore || 100,
      policyCompliance: policyCompliance !== undefined ? policyCompliance : true,
      trainingCompletion: trainingCompletion !== undefined ? trainingCompletion : true,
      hrComments: hrComments || "",
    };

    review.historyLog.push({
      action: "HR_VALIDATION_COMPLETED",
      performedBy: req.user.id || req.user._id,
      notes: "HR policy and compliance review validated.",
    });

    await review.save();

    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (err) {
    console.error("Error submitting HR review:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Finalize review and set recommendation
// @route   PUT /api/reviews/:id/finalize
// @access  Private (HR/Admin)
exports.finalizeReview = async (req, res) => {
  try {
    const { ratingCategory, finalRating, summaryNotes } = req.body;

    const review = await PerformanceReview.findById(req.params.id)
      .populate("employeeId")
      .populate("userId");

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    if (!["Admin", "HR"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Only HR or Admin can finalize reviews" });
    }

    const calculatedRating = Number(finalRating) || review.managerReview?.overallRating || 3;
    const category = ratingCategory || (calculatedRating >= 4.5 ? "EXCELLENT" : calculatedRating >= 3.5 ? "GOOD" : calculatedRating >= 2.5 ? "AVERAGE" : calculatedRating >= 2 ? "NEEDS_IMPROVEMENT" : "PIP_RECOMMENDED");

    review.finalRecommendation = {
      ratingCategory: category,
      finalRating: calculatedRating,
      finalizedAt: new Date(),
      finalizedBy: req.user.id || req.user._id,
      summaryNotes: summaryNotes || "",
    };

    review.status = "FINALIZED";
    if (category === "PIP_RECOMMENDED") {
      review.isPIPTriggered = true;
    }

    review.historyLog.push({
      action: "REVIEW_FINALIZED",
      performedBy: req.user.id || req.user._id,
      notes: `Review finalized. Recommendation: ${category} (${calculatedRating}/5).`,
    });

    await review.save();

    // 🚀 HRMS V2 Integration: Update PerformanceSummary.lastReview
    try {
      let summary = await PerformanceSummary.findOne({ employeeId: review.userId._id || review.userId });
      if (!summary) {
        summary = new PerformanceSummary({
          employeeId: review.userId._id || review.userId,
          currentRating: calculatedRating * 20,
          stars: Math.round(calculatedRating),
        });
      }
      summary.lastReview = {
        date: new Date(),
        rating: calculatedRating,
        reviewId: review._id,
      };
      summary.ratingTier = category.toLowerCase().replace("_", "-");
      summary.stars = Math.round(calculatedRating);
      await summary.save();
    } catch (sumErr) {
      console.error("Error updating PerformanceSummary on review finalization:", sumErr);
    }

    // 🚀 HRMS V2 Integration: Log EmployeeTimeline event
    try {
      await EmployeeTimeline.logEvent({
        employeeId: review.employeeId._id || review.employeeId,
        eventType: "PERFORMANCE_REVIEW_FINALIZED",
        title: `Performance Review Finalized: ${category}`,
        description: `Appraisal completed with rating ${calculatedRating}/5 (${category}). ${summaryNotes ? 'Notes: ' + summaryNotes : ''}`,
        category: "PERFORMANCE",
        metadata: {
          reviewId: review._id,
          finalRating: calculatedRating,
          ratingCategory: category,
        },
        performedBy: req.user.id || req.user._id,
      });
    } catch (timeErr) {
      console.error("Error logging EmployeeTimeline event:", timeErr);
    }

    // 🚀 HRMS V2 Integration: Audit Log Entry
    try {
      await Log.create({
        action: "PERFORMANCE_REVIEW_FINALIZED",
        performedBy: req.user.id || req.user._id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        affectedResource: "PerformanceReview",
        resourceId: review._id,
        newState: review.toObject(),
        details: {
          recommendation: category,
          finalRating: calculatedRating,
          isAdminOverride: req.user.role === "Admin",
        },
        status: "SUCCESS",
      });
    } catch (auditErr) {
      console.error("Error logging audit trail for review finalization:", auditErr);
    }

    // Send notifications to employee & manager
    try {
      await sendNotification({
        recipient: review.userId._id || review.userId,
        title: "Performance Review Finalized",
        message: `Your performance evaluation has been finalized. Result: ${category}. Click to view details.`,
        type: "PERFORMANCE_REVIEW",
      });
      if (review.managerId) {
        await sendNotification({
          recipient: review.managerId,
          title: "Team Review Finalized",
          message: `Performance review for employee has been finalized with rating ${calculatedRating}/5.`,
          type: "PERFORMANCE_REVIEW",
        });
      }
    } catch (notifErr) {
      console.error("Finalization notifications failed:", notifErr.message);
    }

    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (err) {
    console.error("Error finalizing review:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Admin override: reopen review
// @route   POST /api/reviews/:id/reopen
// @access  Private (Admin only)
exports.reopenReview = async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ success: false, message: "Only Admin can reopen reviews" });
    }

    const review = await PerformanceReview.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    review.status = "MANAGER_REVIEW_PENDING";
    review.historyLog.push({
      action: "REVIEW_REOPENED_BY_ADMIN",
      performedBy: req.user.id || req.user._id,
      notes: req.body.reason || "Reopened by Admin for evaluation update.",
    });

    await review.save();

    res.status(200).json({
      success: true,
      message: "Review reopened successfully",
      data: review,
    });
  } catch (err) {
    console.error("Error reopening review:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get employee review history
// @route   GET /api/reviews/employee/:employeeId/history
// @access  Private
exports.getEmployeeReviewHistory = async (req, res) => {
  try {
    const reviews = await PerformanceReview.find({
      employeeId: req.params.employeeId,
      status: "FINALIZED",
    })
      .populate("reviewCycleId", "title frequency startDate endDate")
      .populate("managerId", "fullName email role")
      .populate("hrId", "fullName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (err) {
    console.error("Error fetching review history:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get review statistics
// @route   GET /api/reviews/stats
// @access  Private (HR/Manager/Admin)
exports.getReviewStats = async (req, res) => {
  try {
    const totalCount = await PerformanceReview.countDocuments();
    const pendingSelfCount = await PerformanceReview.countDocuments({ status: "SELF_REVIEW_PENDING" });
    const pendingManagerCount = await PerformanceReview.countDocuments({ status: "MANAGER_REVIEW_PENDING" });
    const pendingHRCount = await PerformanceReview.countDocuments({ status: "HR_REVIEW_PENDING" });
    const finalizedCount = await PerformanceReview.countDocuments({ status: "FINALIZED" });
    const pipRecommendedCount = await PerformanceReview.countDocuments({ "finalRecommendation.ratingCategory": "PIP_RECOMMENDED" });

    res.status(200).json({
      success: true,
      data: {
        totalCount,
        pendingSelfCount,
        pendingManagerCount,
        pendingHRCount,
        finalizedCount,
        pipRecommendedCount,
      },
    });
  } catch (err) {
    console.error("Error fetching review stats:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
