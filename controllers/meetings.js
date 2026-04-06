const Meeting = require("../models/Meeting");
const Lead = require("../models/Lead");
const Prospect = require("../models/Prospect");
const User = require("../models/User");
const notificationService = require("../services/notificationService");

// @desc    Create new meeting
// @route   POST /api/meetings/create
// @access  Private
exports.createMeeting = async (req, res) => {
  try {
    const { leadId, contactId, title, type, invitedParticipants = [] } = req.body;
    const timestamp = Date.now();
    
    // Slugify title for better room ID readability
    const slugify = (text) => text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')     // Replace spaces with -
      .replace(/[^\w\-]+/g, '') // Remove all non-word chars
      .replace(/\-\-+/g, '-');  // Replace multiple - with single -

    const roomSlug = slugify(title || "CRM Meeting");
    const roomId = `${roomSlug}-${timestamp}`;
    const meetingUrl = `https://meet.jit.si/${roomId}`;

    const meetingType = type || (leadId || contactId ? "external" : "internal");

    const meeting = await Meeting.create({
      roomId,
      title: title || "CRM Meeting",
      meetingUrl,
      leadId: leadId || null,
      contactId: contactId || null,
      meetingType,
      invitedParticipants,
      createdBy: req.user.id,
      status: "active",
    });

    const creator = await User.findById(req.user.id).select("fullName");

    // Case 1: Targeted Meeting (specific participants)
    if (invitedParticipants.length > 0) {
      notificationService.sendCallAlert(invitedParticipants, {
        roomId: meeting.roomId,
        title: meeting.title,
        creatorId: req.user.id,
        creatorName: creator?.fullName || "Admin",
      });
    }
    // Case 2: General Internal Meeting (Notification for everyone)
    else if (meetingType === "internal") {
      try {
        await notificationService.notifyAllActiveUsers({
          type: "TEAM_HUDDLE",
          message: `📢 ${creator?.fullName || "Admin"} started a team huddle: "${meeting.title}". Click to join!`,
        });
      } catch (notifErr) {
        console.error("❌ Notification failed for huddle:", notifErr);
      }
    }

    res.status(201).json({
      success: true,
      data: meeting,
    });
  } catch (error) {
    console.error("Error creating meeting:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Get all meetings for a lead/contact or by type
// @route   GET /api/meetings
// @access  Private
exports.getMeetings = async (req, res) => {
  try {
    const { leadId, contactId, type } = req.query;
    let query = {};

    if (leadId) query.leadId = leadId;
    if (contactId) query.contactId = contactId;
    if (type) query.meetingType = type;

    const meetings = await Meeting.find(query)
      .populate("createdBy", "fullName")
      .sort("-createdAt");

    res.status(200).json({
      success: true,
      count: meetings.length,
      data: meetings,
    });
  } catch (error) {
    console.error("Error fetching meetings:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Get single meeting
// @route   GET /api/meetings/:id
// @access  Private
exports.getMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id).populate("createdBy", "fullName");

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    res.status(200).json({
      success: true,
      data: meeting,
    });
  } catch (error) {
    console.error("Error fetching meeting:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    End meeting
// @route   PATCH /api/meetings/:id/end
// @access  Private
exports.endMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    const endedAt = new Date();
    const duration = Math.floor((endedAt - meeting.startedAt) / 1000);

    meeting.status = "ended";
    meeting.endedAt = endedAt;
    meeting.duration = duration;

    await meeting.save();

    res.status(200).json({
      success: true,
      data: meeting,
    });
  } catch (error) {
    console.error("Error ending meeting:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
