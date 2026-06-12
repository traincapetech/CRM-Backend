const mongoose = require("mongoose");
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
    const { leadId, contactId, title, description, type, meetingType: meetingTypeBody, invitedParticipants = [] } = req.body;
    const timestamp = Date.now();
    
    console.log("🚀 [CREATE MEETING] Request body:", {
      title,
      type,
      meetingTypeBody,
      invitedCount: invitedParticipants.length,
      invitedParticipants: invitedParticipants // Log full array to see IDs
    });
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

    const validParticipants = invitedParticipants.filter(id => id && mongoose.Types.ObjectId.isValid(id));
    if (validParticipants.length !== invitedParticipants.length) {
      console.warn(`⚠️ [CREATE MEETING] Filtered out ${invitedParticipants.length - validParticipants.length} invalid participant IDs`);
    }

    const meetingType = meetingTypeBody || type || (leadId || contactId ? "external" : "internal");

    const meeting = await Meeting.create({
      roomId,
      title: title || "CRM Meeting",
      description: description || "",
      meetingUrl,
      leadId: leadId || null,
      contactId: contactId || null,
      meetingType,
      invitedParticipants: validParticipants,
      createdBy: req.user.id,
      status: "active",
    });

    const creator = await User.findById(req.user.id).select("fullName");

    // Case 1: Targeted Meeting (specific participants)
    if (invitedParticipants.length > 0) {
      console.log(`🚀 [CREATE MEETING] Inviting ${invitedParticipants.length} users:`, invitedParticipants);
      
      // 1. Send High-Intensity Socket Alert
      console.log(`🚀 [CREATE MEETING] Result:`, {
        id: meeting._id,
        meetingType: meeting.meetingType,
        invited: meeting.invitedParticipants
      });

      notificationService.sendCallAlert(validParticipants, {
        meetingId: meeting._id,
        roomId: roomId,
        title: title || "Internal Huddle",
        description: description || "",
        creatorId: req.user.id,
        creatorName: creator?.fullName || req.user.fullName || "Team Member",
        type: meetingType
      });

      // 2. Also create a formal notification for their history
      for (const pId of invitedParticipants) {
        try {
          await notificationService.createNotification({
            recipient: pId,
            type: "TEAM_HUDDLE",
            message: `🎥 High-Priority Huddle: "${meeting.title}" from ${creator?.fullName || "Admin"}. Come join us.`,
          });
        } catch (notifErr) {
          console.error("❌ Notification creation failed for participant:", pId, notifErr);
        }
      }
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

    // Notify all admins of the new meeting
    try {
      await notificationService.notifyAdmins({
        type: "ACTIVITY",
        message: `New meeting '${meeting.title}' (${meeting.meetingType}) was created by ${req.user.fullName}.`,
        data: { meetingId: meeting._id }
      });
    } catch (notifyError) {
      console.error("Admin notification error (non-blocking):", notifyError);
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

    // Notify all admins that the meeting ended
    try {
      await notificationService.notifyAdmins({
        type: "ACTIVITY",
        message: `Meeting '${meeting.title}' was ended by ${req.user.fullName}. Duration: ${Math.floor(duration / 60)} minutes.`,
        data: { meetingId: meeting._id }
      });
    } catch (notifyError) {
      console.error("Admin notification error (non-blocking):", notifyError);
    }

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
// @desc    Get meetings for current logged in user (internal huddles)
// @route   GET /api/meetings/my-huddles
// @access  Private
exports.getMyMeetings = async (req, res) => {
  try {
    let userId = req.user.id;
    if (["Admin", "Manager", "IT Manager", "HR"].includes(req.user.role) && req.query.userId) {
      userId = req.query.userId;
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);

    console.log(`🔍 [GET MY MEETINGS] Fetching huddles for user: ${userId}`);
    console.log(`🔍 [GET MY MEETINGS] Querying for user: ${userId} (${userObjectId})`);
    
    // Find internal meetings where:
    // 1. User is the creator
    // 2. User is explicitly invited
    // 3. It's a general internal meeting (no specific invites)
    const meetings = await Meeting.find({
      meetingType: "internal",
      $or: [
        { invitedParticipants: userObjectId },
        { createdBy: userObjectId },
        { invitedParticipants: { $size: 0 } },
        { invitedParticipants: { $exists: false } }
      ],
    })
    .populate("createdBy", "fullName email avatar")
    .populate("invitedParticipants", "fullName email avatar")
    .sort({ createdAt: -1 });

    console.log(`🔍 [GET MY MEETINGS] Found ${meetings.length} internal meetings`);
 // active meetings first (alphabetically 'active' < 'ended')

    // Re-sort: active first, then by date descending
    const sorted = [
      ...meetings.filter((m) => m.status === "active"),
      ...meetings.filter((m) => m.status !== "active").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    ];

    res.status(200).json({
      success: true,
      count: sorted.length,
      data: sorted,
    });
  } catch (error) {
    console.error("Error fetching my huddles:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
// @desc    Add more participants to an active meeting
// @route   PATCH /api/meetings/:id/invite
// @access  Private
exports.inviteParticipants = async (req, res) => {
  try {
    const { participants } = req.body;
    if (!participants || !Array.isArray(participants)) {
      return res.status(400).json({ success: false, message: "Participants list required" });
    }

    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }

    if (meeting.status !== "active") {
      return res.status(400).json({ success: false, message: "Meeting is no longer active" });
    }

    // Add new participants, avoiding duplicates
    const currentParticipants = meeting.invitedParticipants.map(id => id.toString());
    const newParticipants = participants.filter(id => !currentParticipants.includes(id.toString()));

    if (newParticipants.length > 0) {
      meeting.invitedParticipants.push(...newParticipants);
      await meeting.save();

      const creator = await User.findById(meeting.createdBy).select("fullName");

      // Send real-time call alert to the NEWLY added participants
      notificationService.sendCallAlert(newParticipants, {
        roomId: meeting.roomId,
        title: meeting.title,
        creatorId: meeting.createdBy,
        creatorName: creator?.fullName || "Admin",
      });

      // Also create formal notifications
      for (const pId of newParticipants) {
        try {
          await notificationService.createNotification({
            recipient: pId,
            type: "TEAM_HUDDLE",
            message: `🎥 You've been added to a huddle: "${meeting.title}" by ${creator?.fullName || "Admin"}. Come join us.`,
          });
        } catch (notifErr) {
          console.error("❌ Notification creation failed for participant:", pId, notifErr);
        }
      }
    }

    res.status(200).json({
      success: true,
      data: meeting,
    });
  } catch (error) {
    console.error("Error inviting participants:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
