const mongoose = require("mongoose");

const { Schema } = mongoose;

// Constants

const TICKET_STATUS = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
];

const TICKET_PRIORITY = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const allowedTransitions = {
  OPEN: ["ASSIGNED"],
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS"],
};

// Schema

const ticketSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      required: true,
    },

    // User who raised the ticket
    raisedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Assigned department (virtual department ID: IT, SALES, LEAD, HR)
    assignedDept: {
      type: String,
      default: null,
      index: true,
    },

    // Preferred department (optional - suggested by ticket raiser)
    preferredDept: {
      type: String,
      default: null,
    },

    // Assigned department member
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: TICKET_STATUS,
      default: "OPEN",
      index: true,
    },

    priority: {
      type: String,
      enum: TICKET_PRIORITY,
      default: "LOW",
    },

    closedAt: {
      type: Date,
      default: null,
    },

    reopenDeadline: {
      type: Date,
      default: null,
    },

    // Attachments
    attachments: [
      {
        url: String,
        fileType: String,
        fileName: String,
      },
    ],

    // SLA & Timing
    dueDate: {
      type: Date,
    },

    slaStatus: {
      type: String,
      enum: ["ON_TIME", "AT_RISK", "OVERDUE", "BREACHED"],
      default: "ON_TIME",
    },

    lastActivityAt: {
      type: Date,
      default: Date.now,
    },

    // Activity Log
    activityLog: [
      {
        action: String, // 'CREATED', 'ASSIGNED', 'STATUS_CHANGE', 'COMMENT', 'ATTACHMENT'
        performedBy: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        details: String,
      },
    ],

    // Optional: track how many times reopened
    reopenCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes (Important for dashboards)

ticketSchema.index({ assignedTo: 1, status: 1 });
ticketSchema.index({ raisedBy: 1, status: 1 });
ticketSchema.index({ assignedDept: 1, status: 1 });

// Status Transition Validation
ticketSchema.pre("save", function (next) {
  if (!this.isModified("status")) return next();

  if (this.isNew) return next();

  const previousStatus = this.$locals.previousStatus;

  if (
    previousStatus &&
    !allowedTransitions[previousStatus]?.includes(this.status)
  ) {
    return next(
      new Error(
        `Invalid status transition from ${previousStatus} to ${this.status}`,
      ),
    );
  }

  next();
});

// Capture Previous Status Before Update

ticketSchema.pre("findOneAndUpdate", async function (next) {
  const doc = await this.model.findOne(this.getQuery());
  if (doc) {
    this._update.$locals = { previousStatus: doc.status };
  }
  next();
});

// Instance Methods

// Assign Ticket
ticketSchema.methods.assignTicket = function (deptId, userId) {
  this.assignedDept = deptId;
  this.assignedTo = userId;
  this.status = "ASSIGNED";
};

// Start Work
ticketSchema.methods.startProgress = function () {
  this.status = "IN_PROGRESS";
};

// Resolve Ticket
ticketSchema.methods.resolveTicket = function () {
  this.status = "RESOLVED";
};

// Close Ticket (starts 3-day reopen window)
ticketSchema.methods.closeTicket = function () {
  this.status = "CLOSED";
  this.closedAt = new Date();
  this.reopenDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
};

// Reopen Ticket (if within allowed window)
ticketSchema.methods.reopenTicket = function () {
  if (!this.reopenDeadline || Date.now() > this.reopenDeadline) {
    throw new Error("Reopen window expired");
  }

  this.status = "REOPENED";
  this.reopenCount += 1;
  this.closedAt = null;
  this.reopenDeadline = null;
};

// Static Methods

// Check if ticket can be reopened
ticketSchema.statics.canReopen = function (ticket) {
  return (
    ticket.status === "CLOSED" &&
    ticket.reopenDeadline &&
    Date.now() <= ticket.reopenDeadline
  );
};

// Export

module.exports = mongoose.model("Ticket", ticketSchema);
