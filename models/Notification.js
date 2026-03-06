const mongoose = require("mongoose");
const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "TICKET_CREATED",
        "TICKET_ASSIGNED",
        "STATUS_CHANGED",
        "NEW_MESSAGE",
        "SLA_BREACH",
        "TICKET_REOPENED",
        "SALARY_PAYOUT",
        "ACTIVITY",
      ],


      required: true,
    },
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
      required: false,
    },
    questionnaireId: {
      type: Schema.Types.ObjectId,
      ref: "Questionnaire",
      required: false,
    },

    message: {
      type: String,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast fetching of unread notifications for a user
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
