const mongoose = require("mongoose");

const MeetingSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
      default: "CRM Meeting",
    },
    meetingUrl: {
      type: String,
      required: true,
    },
    // Optionally link to a lead
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
    },
    // Optionally link to a prospect/contact
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prospect",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "active", "ended"],
      default: "active",
    },
    participants: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        name: String,
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        leftAt: Date,
      },
    ],
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number, // in seconds
      default: 0,
    },
    meetingType: {
      type: String,
      enum: ["external", "internal"],
      default: "internal",
    },
    invitedParticipants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index for quick lookup by leadId/contactId
MeetingSchema.index({ leadId: 1, createdAt: -1 });
MeetingSchema.index({ contactId: 1, createdAt: -1 });
MeetingSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model("Meeting", MeetingSchema);
