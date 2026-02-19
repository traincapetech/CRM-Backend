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
      const user = await User.findById(decoded.id);
      if (!user) throw new Error("User not found");

      socket.user = user;
      console.log(`User connected to Ticket Socket: ${user.name}`);
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
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) return;

      // Only ticket owner or assigned member can join
      if (
        ticket.raisedBy.toString() !== socket.user._id.toString() &&
        ticket.assignedTo?.toString() !== socket.user._id.toString()
      )
        return;

      socket.join(`ticket_${ticketId}`);
      console.log(`User ${socket.user.name} joined ticket_${ticketId}`);
    } catch (err) {
      console.error("Error joining ticket room:", err.message);
    }
  });

  /**
   * Send message
   */
  socket.on("send_message", async ({ ticketId, message, attachments = [] }) => {
    try {
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) return;

      // Permission check
      if (
        ticket.raisedBy.toString() !== socket.user._id.toString() &&
        ticket.assignedTo?.toString() !== socket.user._id.toString()
      )
        return;

      const newMessage = await TicketChat.create({
        ticketId,
        sender: socket.user._id,
        message,
        attachments,
        messageType: attachments.length > 0 ? "FILE" : "TEXT",
      });

      const populatedMessage = await newMessage.populate("sender", "name role");

      io.to(`ticket_${ticketId}`).emit("receive_message", populatedMessage);
    } catch (err) {
      console.error("Error sending ticket message:", err.message);
    }
  });

  /**
   * Typing indicator
   */
  socket.on("typing", ({ ticketId }) => {
    // socket.to(`ticket_${ticketId}`).emit("user_typing", {
    //   userId: socket.user._id,
    //   name: socket.user.name,
    // });
    console.log(socket)
  });

  /**
   * Mark messages as read
   */
  socket.on("mark_as_read", async ({ ticketId }) => {
    try {
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
