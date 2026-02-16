// /sockets/chatSocket.js
const ChatService = require("../services/chatService");
const User = require("../models/User");

module.exports = (io, socket) => {
  console.log("Chat socket connected:", socket.id);

  // Join personal room for targeted messages
  socket.on("join-user-room", async (userId) => {
    socket.join(`user-${userId}`);
    console.log(`User ${userId} joined room user-${userId}`);

    try {
      await ChatService.updateUserStatus(userId, "ONLINE");
      socket.broadcast.emit("userStatusUpdate", {
        userId,
        status: "ONLINE",
        lastSeen: new Date(),
      });
    } catch (err) {
      console.error("Error updating user status:", err);
    }
  });

  // Send a direct message
  socket.on("sendMessage", async (data) => {
    try {
      const { senderId, recipientId, content, messageType = "text" } = data;

      const message = await ChatService.saveMessage({
        senderId,
        recipientId,
        content,
        messageType,
      });

      // Send to recipient
      io.to(`user-${recipientId}`).emit("newMessage", {
        _id: message._id,
        chatId: message.chatId,
        senderId: message.senderId,
        recipientId: message.recipientId,
        content: message.content,
        messageType: message.messageType,
        timestamp: message.timestamp,
        isRead: message.isRead,
      });

      // Confirmation to sender
      socket.emit("messageDelivered", {
        _id: message._id,
        timestamp: message.timestamp,
      });

      // Notification
      io.to(`user-${recipientId}`).emit("messageNotification", {
        senderId: message.senderId,
        senderName: message.senderId.fullName,
        content: message.content,
        timestamp: message.timestamp,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      socket.emit("messageError", { error: error.message });
    }
  });

  // Typing indicator
  socket.on("typing", ({ recipientId, senderId, isTyping }) => {
    io.to(`user-${recipientId}`).emit("userTyping", { senderId, isTyping });
  });

  // Update user status
  socket.on("updateStatus", async ({ userId, status }) => {
    try {
      await ChatService.updateUserStatus(userId, status);
      io.emit("userStatusUpdate", { userId, status, lastSeen: new Date() });
    } catch (err) {
      console.error("Error updating status:", err);
    }
  });

  // Disconnect handling
  socket.on("disconnect", () => {
    console.log("Chat socket disconnected:", socket.id);
    // Optional: Handle offline status here if you store userId in socket data
  });
};
