const mongoose = require("mongoose");
const Meeting = require("../models/Meeting");
const Lead = require("../models/Lead");
const Prospect = require("../models/Prospect");
const User = require("../models/User");
const notificationService = require("../services/notificationService");

const ensureDailyRoomExists = async (roomId) => {
  const apiKey = process.env.DAILY_API_KEY;
  const dailyDomain = process.env.DAILY_DOMAIN || "second-police";
  if (!roomId) return `https://${dailyDomain}.daily.co/crm-meeting`;

  if (!apiKey) {
    console.warn("⚠️ [DAILY.CO] DAILY_API_KEY is missing in environment variables!");
    return `https://${dailyDomain}.daily.co/${roomId}`;
  }

  try {
    // 1. Check if room already exists on Daily.co cloud
    const checkRes = await fetch(`https://api.daily.co/v1/rooms/${roomId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (checkData && checkData.url) {
        return checkData.url;
      }
    }

    // 2. If room does not exist, provision it on Daily.co cloud
    console.log(`🚀 [DAILY.CO] Provisioning room: ${roomId}`);
    const createRes = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: roomId,
        properties: {
          enable_chat: true,
          exp: Math.floor(Date.now() / 1000) + 86400,
        },
      }),
    });
    const createData = await createRes.json();
    if (createRes.ok && createData && createData.url) {
      console.log(`✅ [DAILY.CO] Room provisioned successfully: ${createData.url}`);
      return createData.url;
    } else {
      console.error(`⚠️ [DAILY.CO] Room provisioning response error:`, createData);
    }
  } catch (err) {
    console.error(`⚠️ [DAILY.CO] Room provisioning fetch error:`, err.message);
  }

  return `https://${dailyDomain}.daily.co/${roomId}`;
};

const { sendEmail } = require("../config/nodemailer");

const sendMeetingEmailInvitations = async (meeting, creatorName, invitedUserIds) => {
  try {
    const users = await User.find({ _id: { $in: invitedUserIds } }).select("email fullName");
    if (!users || users.length === 0) return;

    const scheduledDateObj = meeting.scheduledAt ? new Date(meeting.scheduledAt) : new Date(meeting.createdAt);
    const formattedDate = scheduledDateObj.toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
    });

    const isScheduled = meeting.isScheduled && meeting.status === "scheduled";
    const subject = isScheduled
      ? `📅 Scheduled Meeting Invitation: ${meeting.title}`
      : `🎥 Live Meeting Invitation: ${meeting.title}`;

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;">
        <div style="background-color: #4f46e5; padding: 24px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 800;">${isScheduled ? "📅 Scheduled Meeting Invitation" : "🎥 Live Team Meeting"}</h2>
          <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">Hosted by ${creatorName}</p>
        </div>
        <div style="padding: 24px;">
          <h3 style="margin-top: 0; color: #0f172a; font-size: 20px;">${meeting.title}</h3>
          ${meeting.description ? `<p style="color: #475569; font-size: 14px; line-height: 1.5;">${meeting.description}</p>` : ""}
          
          <div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; margin: 20px 0; border: 1px solid #f1f5f9;">
            <div style="margin-bottom: 8px; font-size: 14px; color: #334155;">
              <strong>📅 Scheduled Date & Time:</strong> ${formattedDate}
            </div>
            <div style="margin-bottom: 8px; font-size: 14px; color: #334155;">
              <strong>⏳ Duration:</strong> ${meeting.duration || 30} minutes
            </div>
            <div style="font-size: 14px; color: #334155;">
              <strong>👤 Host:</strong> ${creatorName}
            </div>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${meeting.meetingUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; font-weight: 700; border-radius: 12px; display: inline-block; font-size: 15px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">
              ${isScheduled ? "🔗 View Meeting Link" : "🚀 Join Meeting Now"}
            </a>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center;">
            Meeting Link: <a href="${meeting.meetingUrl}" style="color: #4f46e5;">${meeting.meetingUrl}</a>
          </p>
        </div>
      </div>
    `;

    for (const u of users) {
      if (u.email) {
        sendEmail(u.email, subject, "", htmlContent).catch((e) =>
          console.error("Email send error for user:", u.email, e.message)
        );
      }
    }
  } catch (err) {
    console.error("Error sending meeting email invitations:", err.message);
  }
};

// @desc    Create new meeting
// @route   POST /api/meetings/create
// @access  Private
exports.createMeeting = async (req, res) => {
  try {
    const {
      leadId,
      contactId,
      title,
      description,
      type,
      meetingType: meetingTypeBody,
      invitedParticipants = [],
      scheduledAt: rawScheduledAt,
      duration: reqDuration,
      isScheduled: reqIsScheduled,
      sendEmailInvite = true,
    } = req.body;

    const duration = parseInt(reqDuration, 10) || 30;
    const scheduledAtDate = rawScheduledAt ? new Date(rawScheduledAt) : new Date();
    const isFuture = scheduledAtDate.getTime() > Date.now() + 2 * 60 * 1000;
    const isScheduled = reqIsScheduled !== undefined ? reqIsScheduled : isFuture;
    const status = isScheduled && isFuture ? "scheduled" : "active";
    const scheduledEndTimeDate = new Date(scheduledAtDate.getTime() + duration * 60 * 1000);

    const timestamp = Date.now();
    
    console.log("🚀 [CREATE MEETING] Request body:", {
      title,
      type,
      meetingTypeBody,
      scheduledAt: scheduledAtDate,
      isScheduled,
      status,
      invitedCount: invitedParticipants.length,
    });

    const slugify = (text) => text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+|-+$/g, '')
      || "crm-meeting";

    const roomSlug = slugify(title || "CRM Meeting");
    const roomId = `${roomSlug}-${timestamp}`;
    
    const meetingUrl = await ensureDailyRoomExists(roomId);

    const validParticipants = invitedParticipants.filter(id => id && mongoose.Types.ObjectId.isValid(id));
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
      status,
      scheduledAt: scheduledAtDate,
      scheduledEndTime: scheduledEndTimeDate,
      duration,
      isScheduled,
    });

    const creator = await User.findById(req.user.id).select("fullName");
    const creatorName = creator?.fullName || req.user.fullName || "Team Member";

    if (validParticipants.length > 0) {
      if (status === "active") {
        notificationService.sendCallAlert(validParticipants, {
          meetingId: meeting._id,
          roomId: roomId,
          meetingUrl: meeting.meetingUrl,
          title: title || "Internal Huddle",
          description: description || "",
          creatorId: req.user.id,
          creatorName,
          type: meetingType,
        });
      }

      const timeLabel = new Date(scheduledAtDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const notifMsg = isScheduled
        ? `📅 Meeting Scheduled: "${meeting.title}" on ${scheduledAtDate.toLocaleDateString()} at ${timeLabel} by ${creatorName}.`
        : `🎥 High-Priority Huddle: "${meeting.title}" from ${creatorName}. Come join us.`;

      for (const pId of validParticipants) {
        try {
          await notificationService.createNotification({
            recipient: pId,
            type: "TEAM_HUDDLE",
            message: notifMsg,
          });
        } catch (notifErr) {
          console.error("❌ Notification creation failed for participant:", pId, notifErr);
        }
      }

      if (sendEmailInvite) {
        sendMeetingEmailInvitations(meeting, creatorName, validParticipants);
      }
    }
    else if (meetingType === "internal" && status === "active") {
      try {
        await notificationService.notifyAllActiveUsers({
          type: "TEAM_HUDDLE",
          message: `📢 ${creatorName} started a team huddle: "${meeting.title}". Click to join!`,
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

    // Auto-provision Daily.co room if it was created offline or missed
    if (meeting.roomId) {
      const liveUrl = await ensureDailyRoomExists(meeting.roomId);
      if (meeting.meetingUrl !== liveUrl) {
        meeting.meetingUrl = liveUrl;
        await meeting.save();
      }
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

    // Re-sort: active first, then scheduled (upcoming), then ended/cancelled
    const sorted = [
      ...meetings.filter((m) => m.status === "active"),
      ...meetings.filter((m) => m.status === "scheduled").sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
      ...meetings.filter((m) => m.status !== "active" && m.status !== "scheduled").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
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

    if (meeting.status !== "active" && meeting.status !== "scheduled") {
      return res.status(400).json({ success: false, message: "Meeting is no longer active or scheduled" });
    }

    // Add new participants, avoiding duplicates
    const currentParticipants = meeting.invitedParticipants.map(id => id.toString());
    const newParticipants = participants.filter(id => !currentParticipants.includes(id.toString()));

    if (newParticipants.length > 0) {
      meeting.invitedParticipants.push(...newParticipants);
      await meeting.save();

      const creator = await User.findById(meeting.createdBy).select("fullName");

      if (meeting.status === "active") {
        notificationService.sendCallAlert(newParticipants, {
          roomId: meeting.roomId,
          title: meeting.title,
          creatorId: meeting.createdBy,
          creatorName: creator?.fullName || "Admin",
        });
      }

      for (const pId of newParticipants) {
        try {
          await notificationService.createNotification({
            recipient: pId,
            type: "TEAM_HUDDLE",
            message: `🎥 You've been added to a huddle: "${meeting.title}" by ${creator?.fullName || "Admin"}.`,
          });
        } catch (notifErr) {
          console.error("❌ Notification creation failed for participant:", pId, notifErr);
        }
      }

      sendMeetingEmailInvitations(meeting, creator?.fullName || "Admin", newParticipants);
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

// @desc    Update scheduled meeting details
// @route   PUT /api/meetings/:id
// @access  Private
exports.updateMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }

    // Only host or admin can update
    const isHost = meeting.createdBy.toString() === req.user.id;
    const isAdmin = ["Admin", "Manager", "IT Manager"].includes(req.user.role);
    if (!isHost && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized to edit this meeting" });
    }

    const { title, description, scheduledAt, duration, invitedParticipants } = req.body;
    if (title) meeting.title = title;
    if (description !== undefined) meeting.description = description;
    if (duration) meeting.duration = parseInt(duration, 10) || 30;

    if (scheduledAt) {
      const scheduledDateObj = new Date(scheduledAt);
      meeting.scheduledAt = scheduledDateObj;
      meeting.scheduledEndTime = new Date(scheduledDateObj.getTime() + (meeting.duration || 30) * 60 * 1000);
      if (scheduledDateObj.getTime() > Date.now()) {
        meeting.status = "scheduled";
        meeting.isScheduled = true;
      }
    }

    if (invitedParticipants && Array.isArray(invitedParticipants)) {
      meeting.invitedParticipants = invitedParticipants.filter(id => id && mongoose.Types.ObjectId.isValid(id));
    }

    await meeting.save();

    res.status(200).json({
      success: true,
      data: meeting,
    });
  } catch (error) {
    console.error("Error updating meeting:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Cancel/Delete meeting
// @route   PATCH /api/meetings/:id/cancel
// @access  Private
exports.cancelMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }

    const isHost = meeting.createdBy.toString() === req.user.id;
    const isAdmin = ["Admin", "Manager", "IT Manager"].includes(req.user.role);
    if (!isHost && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized to cancel this meeting" });
    }

    meeting.status = "cancelled";
    meeting.cancelled = true;
    await meeting.save();

    res.status(200).json({
      success: true,
      message: "Meeting cancelled successfully",
      data: meeting,
    });
  } catch (error) {
    console.error("Error cancelling meeting:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
