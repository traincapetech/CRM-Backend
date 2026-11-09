const ShiftEndReport = require("../models/ShiftEndReport");
const User = require("../models/User");

// Helper to format dateKey as YYYY-MM-DD in local/server time
const getDateKey = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper to generate the exact WhatsApp text based on role
const generateFormattedText = (role, metrics = {}, summaryNotes = "", userName = "") => {
  const lowerRole = (role || "").toLowerCase();

  // 1. Lead Person format:
  // Shift end report
  // LinkedIn poll : 24
  // WhatsApp polls : 
  // No of Groups : 10
  // Leads Daily: 4
  // Sale :
  if (lowerRole.includes("lead person")) {
    return (
`Shift end report
LinkedIn poll : ${metrics.linkedinPolls ?? ""}
WhatsApp polls : ${metrics.whatsappPolls ?? ""}
No of Groups : ${metrics.noOfGroups ?? ""}
Leads Daily: ${metrics.leadsDaily ?? ""}
Sale : ${metrics.salesCount ?? ""}` +
      (summaryNotes ? `\nRemarks : ${summaryNotes}` : "")
    );
  }

  // 2. Sales Person format:
  // Shift end report 
  // WhatsApp polls:60
  // No. Of groups assigned:12
  // Leads daily:
  // Sale:
  if (
    lowerRole.includes("sales") ||
    lowerRole.includes("executive") ||
    lowerRole.includes("team leader") ||
    lowerRole.includes("sales manager")
  ) {
    return (
`Shift end report
WhatsApp polls:${metrics.whatsappPolls ?? ""}
No. Of groups assigned:${metrics.noOfGroupsAssigned ?? ""}
Leads daily:${metrics.leadsDaily ?? ""}
Sale:${metrics.salesCount ?? ""}` +
      (summaryNotes ? `\nRemarks:${summaryNotes}` : "")
    );
  }

  // 3. Digital Marketing Intern format (KPI-driven numbers):
  // Shift end report
  // Creatives Designed: 4
  // Posts / Reels: 3
  // Leads Generated: 12
  // DMs Handled: 18
  // Ad Spend: 500
  if (lowerRole.includes("digital marketing intern")) {
    return (
`Shift end report
Creatives Designed: ${metrics.creativesDesigned ?? ""}
Posts / Reels: ${metrics.postsReelsPublished ?? ""}
Leads Generated: ${metrics.marketingLeadsGenerated ?? ""}
DMs Handled: ${metrics.engagementReplies ?? ""}
Ad Spend: ${metrics.adSpendReported ?? ""}` +
      (summaryNotes ? `\nRemarks: ${summaryNotes}` : "")
    );
  }

  // 4. Digital Marketing Permanent / Manager format:
  if (lowerRole.includes("marketing")) {
    return (
`Shift end report
Ad Campaigns: ${metrics.adCampaignsManaged ?? ""}
Ad Spend: ${metrics.adSpendReported ?? ""}
Leads Acquired: ${metrics.marketingLeadsGenerated ?? ""}
Creatives Deployed: ${metrics.creativesDesigned ?? ""}
Cost Per Lead: ${metrics.costPerLead ?? ""}` +
      (summaryNotes ? `\nRemarks: ${summaryNotes}` : "")
    );
  }

  // 5. IT Intern / IT Permanent / Tech:
  if (lowerRole.includes("it ") || lowerRole.includes("developer")) {
    return (
`Shift end report
Tasks Completed: ${metrics.tasksCompleted ?? ""}
Bugs Resolved: ${metrics.bugsResolved ?? ""}
PRs / Commits: ${metrics.commitsPushed ?? ""}
Hours Worked: ${metrics.hoursWorked ?? ""}` +
      (summaryNotes ? `\nRemarks: ${summaryNotes}` : "")
    );
  }

  // Fallback generic format (Numbers only)
  return (
`Shift end report - ${userName || "Team Member"}
Tasks Completed: ${metrics.tasksCompleted || metrics.leadsDaily || metrics.salesCount || 0}
Calls / Activities: ${metrics.callsMade || metrics.whatsappPolls || 0}
Hours Worked: ${metrics.hoursWorked || 8}` +
    (summaryNotes ? `\nRemarks: ${summaryNotes}` : "")
  );
};

// @desc    Submit or update today's shift end report
// @route   POST /api/shift-reports
// @access  Private
exports.submitShiftReport = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const userDept = req.user.department?.name || req.user.department || "General";
    const dateKey = req.body.dateKey || getDateKey();
    const metrics = req.body.metrics || {};
    const summaryNotes = req.body.summaryNotes || "";

    const formattedText =
      req.body.formattedText ||
      generateFormattedText(userRole, metrics, summaryNotes, req.user.fullName);

    // Upsert shift end report for today
    const report = await ShiftEndReport.findOneAndUpdate(
      { user: userId, dateKey },
      {
        user: userId,
        role: userRole,
        department: userDept,
        date: new Date(),
        dateKey,
        metrics,
        summaryNotes,
        formattedText,
        status: "Submitted",
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).populate("user", "fullName email role profilePicture");

    res.status(200).json({
      success: true,
      message: "Shift end report submitted successfully",
      data: report,
    });
  } catch (error) {
    console.error("Error submitting shift report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit shift report",
      error: error.message,
    });
  }
};

// @desc    Get today's shift report for logged in user
// @route   GET /api/shift-reports/today
// @access  Private
exports.getTodayReport = async (req, res) => {
  try {
    const userId = req.user._id;
    const dateKey = getDateKey();

    const report = await ShiftEndReport.findOne({ user: userId, dateKey }).populate(
      "user",
      "fullName email role profilePicture"
    );

    res.status(200).json({
      success: true,
      hasSubmitted: !!report,
      data: report || null,
    });
  } catch (error) {
    console.error("Error fetching today's shift report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check today's shift report",
      error: error.message,
    });
  }
};

// @desc    Get my shift report history
// @route   GET /api/shift-reports/my
// @access  Private
exports.getMyReports = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const skip = (page - 1) * limit;

    const query = { user: userId };
    if (req.query.startDate && req.query.endDate) {
      query.dateKey = { $gte: req.query.startDate, $lte: req.query.endDate };
    }

    const total = await ShiftEndReport.countDocuments(query);
    const reports = await ShiftEndReport.find(query)
      .sort({ dateKey: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching my shift reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch shift reports",
      error: error.message,
    });
  }
};

// @desc    Get team shift reports (Admin, Manager, Team Leader)
// @route   GET /api/shift-reports/team
// @access  Private (Admin, Manager, Lead Person, Team Leader)
exports.getTeamShiftReports = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const query = {};

    if (req.query.dateKey) {
      query.dateKey = req.query.dateKey;
    } else if (req.query.startDate && req.query.endDate) {
      query.dateKey = { $gte: req.query.startDate, $lte: req.query.endDate };
    } else {
      // Default to today if no date specified
      query.dateKey = getDateKey();
    }

    if (req.query.role) {
      query.role = req.query.role;
    }

    if (req.query.userId) {
      query.user = req.query.userId;
    }

    if (req.query.department) {
      query.department = req.query.department;
    }

    const total = await ShiftEndReport.countDocuments(query);
    const reports = await ShiftEndReport.find(query)
      .populate("user", "fullName email role profilePicture department")
      .populate("reviewedBy", "fullName role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      dateKey: query.dateKey,
      data: reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching team shift reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch team shift reports",
      error: error.message,
    });
  }
};

