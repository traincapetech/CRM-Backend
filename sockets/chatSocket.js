// /sockets/chatSocket.js
const ChatService = require("../services/chatService");
const User = require("../models/User");

module.exports = (io, socket) => {
  console.log("Chat socket connected:", socket.id);

  // Join personal room for 1-to-1 messages
  socket.on("join-user-room", async (userId) => {
    socket.join(`user-${userId}`);
    socket.data.userId = userId; // Store userId in socket data
    
    try {
      const user = await User.findById(userId);
      if (user && user.role) {
        socket.join(`role-${user.role}`);
        console.log(`✅ [SOCKET] User ${userId} joined standardized role room: role-${user.role}`);
      }

    } catch (err) {
      console.error("Error joining role room:", err);
    }
    
    console.log(`User ${userId} joined their personal room user-${userId}`);
  });




  // Send a direct message
  socket.on("sendMessage", async (data) => {
    try {
      const { senderId, recipientId, content, messageType = "text", attachments = [] } = data;

      const message = await ChatService.saveMessage({
        senderId,
        recipientId,
        content,
        messageType,
        attachments,
      });

      // Send to recipient
      io.to(`user-${recipientId}`).emit("newMessage", {


        _id: message._id,
        chatId: message.chatId,
        senderId: message.senderId,
        recipientId: message.recipientId,
        content: message.content,
        messageType: message.messageType,
        attachments: message.attachments,
        timestamp: message.timestamp,
        isRead: message.isRead,
      });


      // Confirmation to sender
      socket.emit("messageDelivered", {
        _id: message._id,
        timestamp: message.timestamp,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      socket.emit("messageError", { error: error.message });
    }
  });

  // Join group room
  socket.on("join-group", (groupId) => {
    socket.join(`group_${groupId}`);
    console.log(`User ${socket.data.userId} joined group room group_${groupId}`);
  });

  // Send group message
  socket.on("sendGroupMessage", async (data) => {
    try {
      const { groupId, senderId, content, messageType = "text", attachments = [] } = data;

      const message = await ChatService.saveGroupMessage({
        senderId,
        groupId,
        content,
        messageType,
        attachments,
      });

      // Broadcast to group room
      io.to(`group_${groupId}`).emit("newGroupMessage", {
        _id: message._id,
        groupId: message.groupId,
        senderId: message.senderId,
        content: message.content,
        messageType: message.messageType,
        attachments: message.attachments,
        timestamp: message.timestamp,
      });
    } catch (error) {
      console.error("Error sending group message:", error);
      socket.emit("messageError", { error: error.message });
    }
  });

  // Typing indicator (Unified for Direct and Group)
  socket.on("typing", (data) => {
    const { recipientId, groupId, senderId, isTyping } = data;
    if (groupId) {
      socket.to(`group_${groupId}`).emit("typing", { senderId, groupId, isTyping });
    } else {
      socket.to(recipientId).emit("typing", { senderId, isTyping });
    }
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
  socket.on("disconnect", async (reason) => {
    console.log(`Chat socket disconnected: ${socket.id}, reason: ${reason}`);
    
    if (socket.data.userId) {
      const userId = socket.data.userId;
      try {
        await ChatService.updateUserStatus(userId, "OFFLINE");
        io.emit("userStatusUpdate", { 
          userId, 
          status: "OFFLINE", 
          lastSeen: new Date() 
        });
      } catch (err) {
        console.error("Error updating status on disconnect:", err);
      }
    }
  });
};
