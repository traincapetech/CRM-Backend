const jwt = require("jsonwebtoken");
const Ticket = require("../models/Ticket");
const TicketChat = require("../models/TicketChat");
const User = require("../models/User");

/**
 * Ticket Socket Handler
 * @param {Server} io - Socket.IO server instance
 * @param {Socket} socket - Socket.IO socket instance
 */
const ticketSocketHandler = (io, socket) => {
  // Authentication middleware for this socket
  const authenticate = async () => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw new Error("Authentication error");

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id || decoded._id);
      if (!user) throw new Error("User not found");

      socket.user = user;
      console.log(`User connected to Ticket Socket: ${user.name} (${user.role})`);
      
      // Join general user room for personal notifications
      socket.join(`user-${user._id}`);
      
      // Join role-based room for broad notifications (Admins, Managers, etc.)
      socket.join(`role-${user.role}`);
      console.log(`User ${user.name} joined role-${user.role}`);
    } catch (err) {
      console.error("Ticket Socket auth failed:", err.message);
      socket.disconnect(true);
    }
  };

  authenticate();

  /**
   * Join a ticket room
   */
  socket.on("join_ticket", async (ticketId) => {
    try {
      if (!socket.user) return;
      
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) return;

      // Permission check: Owner, Assigned Member, or Admin/Management
      const isOwner = ticket.raisedBy.toString() === socket.user._id.toString();
      const isAssigned = ticket.assignedTo?.toString() === socket.user._id.toString();
      const isAdminOrManager = socket.user.role.match(/Admin|Manager|HR/i);
      
      // If it's a manager/IT/HR, they should only see tickets within their department scope 

      if (!isOwner && !isAssigned && !isAdminOrManager) {
        console.warn(`User ${socket.user.name} denied access to ticket_${ticketId}`);
        return;
      }

      socket.join(`ticket_${ticketId}`);
      console.log(`User ${socket.user.name} joined ticket_${ticketId}`);
    } catch (err) {
      console.error("Error joining ticket room:", err.message);
    }
  });

  /**
   * Send message
   */
  socket.on("send_message", async ({ ticketId, message, attachments = [], replyTo = null }) => {
    try {
      if (!socket.user) return;

      const ticket = await Ticket.findById(ticketId);
      if (!ticket) return;

      // Permission check
      const isAdminOrManager = socket.user.role.match(/Admin|Manager|HR/i);
      if (
        ticket.raisedBy.toString() !== socket.user._id.toString() &&
        ticket.assignedTo?.toString() !== socket.user._id.toString() &&
        !isAdminOrManager
      )
        return;

      const newMessage = await TicketChat.create({
        ticketId,
        sender: socket.user._id,
        message,
        attachments,
        replyTo,
        messageType: attachments.length > 0 ? "FILE" : "TEXT",
      });

      const populatedMessage = await newMessage.populate([
        { path: "sender", select: "name fullName role" },
        { 
          path: "replyTo", 
          populate: { path: "sender", select: "name fullName" } 
        }
      ]);

      io.to(`ticket_${ticketId}`).emit("receive_message", populatedMessage);
      
      // Also notify the other party if they aren't in the room
      // (This would trigger the bell icon update via Notification model if we added it to controller)
    } catch (err) {
      console.error("Error sending ticket message:", err.message);
    }
  });

  /**
   * Typing indicator
   */
  socket.on("typing", ({ ticketId }) => {
    if (!socket.user) return;
    socket.to(`ticket_${ticketId}`).emit("user_typing", {
      userId: socket.user._id,
      name: socket.user.fullName || socket.user.name,
    });
  });

  socket.on("stop_typing", ({ ticketId }) => {
     if (!socket.user) return;
     socket.to(`ticket_${ticketId}`).emit("user_stop_typing", {
       userId: socket.user._id
     });
  });

  /**
   * Mark messages as read
   */
  socket.on("mark_as_read", async ({ ticketId }) => {
    try {
      if (!socket.user) return;
      await TicketChat.updateMany(
        {
          ticketId,
          readBy: { $ne: socket.user._id },
        },
        {
          $push: { readBy: socket.user._id },
        },
      );

      io.to(`ticket_${ticketId}`).emit("messages_read", {
        userId: socket.user._id,
      });
    } catch (err) {
      console.error("Error marking messages as read:", err.message);
    }
  });

  /**
   * Disconnect
   */
  socket.on("disconnect", () => {
    console.log(`User disconnected from Ticket Socket: ${socket.user?.name}`);
  });
};

module.exports = ticketSocketHandler;
