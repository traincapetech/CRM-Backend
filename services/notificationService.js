const Notification = require("../models/Notification");

let io;

/**
 * Initialize notification service with socket.io instance
 * @param {Server} ioInstance 
 */
const init = (ioInstance) => {
  io = ioInstance;
};

/**
 * Create a notification and send it via socket if user is online
 * @param {Object} params
 * @param {String} params.recipient - User ID
 * @param {String} params.type - Notification type
 * @param {String} params.ticketId - Ticket ID
 * @param {String} params.questionnaireId - Questionnaire ID
 * @param {String} params.message - Notification text

 */
const createNotification = async ({ recipient, type, ticketId, questionnaireId, message }) => {
  try {
    const notificationData = {
      recipient,
      type,
      ticketId,
      message,
    };

    if (questionnaireId) {
      notificationData.questionnaireId = questionnaireId;
    }

    const notification = await Notification.create(notificationData);



    // Send via socket if io is initialized
    if (io) {
      // 🔑 Explicitly toString the recipient to ensure room name match
      const recipientId = recipient.toString();
      
      // Users should join a room named `user-${userId}` on connection
      io.to(`user-${recipientId}`).emit("new_notification", {
        _id: notification._id,
        type,
        ticketId,
        questionnaireId,
        message,
        isRead: false,
        createdAt: notification.createdAt,
      });

      // Also emit a general update to refresh unread count
      io.to(`user-${recipientId}`).emit("notification_count_update");
    }

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

/**
 * Broadcast a general ticket update to all users in the ticket room
 * @param {String} ticketId 
 * @param {Object} data - Optional data to send
 */
const broadcastTicketUpdate = (ticketId, data = {}) => {
  if (io) {
    io.to(`ticket_${ticketId}`).emit("ticket_updated", {
      ticketId,
      ...data,
      timestamp: new Date(),
    });
  }
};

/**
 * Broadcast an event to all users with a specific role
 * @param {String} role 
 * @param {String} event 
 * @param {Object} data 
 */
const broadcastToRole = (role, event, data = {}) => {
  if (io) {
    const room = `role-${role}`;
    // Get number of sockets in room for debugging
    const sockets = io.sockets.adapter.rooms.get(room);
    console.log(`📢 [BROADCAST] ${room}: Sending ${event}, Sockets in room: ${sockets ? sockets.size : 0}`);
    
    io.to(room).emit(event, data);
  }
};

/**
 * Broadcast an event to a specific user
 * @param {String} userId 
 * @param {String} event 
 * @param {Object} data 
 */
const broadcastToUser = (userId, event, data = {}) => {
  if (io) {
    const room = `user-${userId}`;
    // Get number of sockets in room for debugging
    const sockets = io.sockets.adapter.rooms.get(room);
    console.log(`📢 [BROADCAST] ${room}: Sending ${event}, Sockets in room: ${sockets ? sockets.size : 0}`);

    io.to(room).emit(event, data);
  }
};

/**
 * Notify all admin users about an event
 * @param {Object} params
 * @param {String} params.type - Notification type
 * @param {String} params.message - Notification message
 * @param {Object} params.data - Additional data
 */
const notifyAdmins = async ({ type, message, ...data }) => {
  try {
    const User = require("../models/User");
    // Find all Admins, then filter in code to be safe with field types
    const allAdmins = await User.find({ role: "Admin" });
    const admins = allAdmins.filter(a => a.active !== false);
    
    console.log(`🔔 [NOTIFY ADMINS] Found ${admins.length} admins (from ${allAdmins.length} total Admin records)`);
    
    for (const admin of admins) {
      console.log(`   👉 Sending to: ${admin.email} (${admin._id})`);
      await createNotification({
        recipient: admin._id,
        type,
        message,
        ...data
      });
    }
  } catch (error) {
    console.error("❌ Error notifying admins:", error);
  }
};

module.exports = {
  init,
  createNotification,
  broadcastTicketUpdate,
  broadcastToRole,
  broadcastToUser,
  notifyAdmins,
};
