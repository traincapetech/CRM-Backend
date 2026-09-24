const cron = require("node-cron");
const Ticket = require("../models/Ticket");
const { createNotification } = require("./notificationService");

/**
 * Runs every 30 minutes to update SLA status of all non-closed/resolved tickets
 */
const startSlaJob = () => {
  // schedule: every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    console.log("🕒 Running SLA Status Update Job...");
    await updateSlaStatuses();
  });
};

/**
 * Updates SLA status for all active tickets
 */
const updateSlaStatuses = async () => {
  try {
    const activeTickets = await Ticket.find({
      status: { $nin: ["RESOLVED", "CLOSED"] },
    });

    const now = new Date();

    for (const ticket of activeTickets) {
      if (!ticket.dueDate) continue;

      const dueDate = new Date(ticket.dueDate);
      const createdAt = new Date(ticket.createdAt);
      const totalDuration = dueDate - createdAt;
      const elapsedDuration = now - createdAt;
      
      let newSlaStatus = ticket.slaStatus;

      // Logic:
      // BREACHED: past due date
      // OVERDUE: within 1 hour of due date (or just past)
      // AT_RISK: > 75% time elapsed
      // ON_TIME: < 75% time elapsed

      if (now > dueDate) {
        newSlaStatus = "BREACHED";
      } else if (dueDate - now < 3600000) { // 1 hour left
        newSlaStatus = "OVERDUE";
      } else if (elapsedDuration / totalDuration > 0.75) {
        newSlaStatus = "AT_RISK";
      }

      // Only update if status changed
      if (newSlaStatus !== ticket.slaStatus) {
        const oldStatus = ticket.slaStatus;
        ticket.slaStatus = newSlaStatus;
        await ticket.save();

        // Notify if it just breached or became overdue
        if (newSlaStatus === "BREACHED" || newSlaStatus === "OVERDUE") {
          const recipients = [];
          if (ticket.assignedTo) recipients.push(ticket.assignedTo);
          // Also notify admin on breach
          if (newSlaStatus === "BREACHED") {
              const User = require("../models/User");
              const admins = await User.find({ role: "Admin" }).select("_id");
              admins.forEach(admin => recipients.push(admin._id));
          }

          for (const recipientId of recipients) {
            await createNotification({
              recipient: recipientId,
              type: "SLA_BREACH",
              ticketId: ticket._id,
              message: `Ticket #${ticket._id.toString().slice(-6)} is now ${newSlaStatus}!`,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("Error in updateSlaStatuses:", error);
  }
};

module.exports = {
  startSlaJob,
  runNow: updateSlaStatuses, // Useful for testing or manual trigger
};
