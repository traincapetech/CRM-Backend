// /sockets/chatSocket.js
const ChatService = require("../services/chatService");
const User = require("../models/User");

// Track users that are currently "waiting" to be marked offline
const disconnectTimeouts = new Map();

module.exports = (io, socket) => {
  console.log("Chat socket connected:", socket.id);

  // Join personal room for 1-to-1 messages
  socket.on("join-user-room", async (userId) => {
    socket.join(`user-${userId}`);
    socket.data.userId = userId; // Store userId in socket data
    
    // If the user was in the "leaving" grace period, clear the timeout
    if (disconnectTimeouts.has(userId)) {
      clearTimeout(disconnectTimeouts.get(userId));
      disconnectTimeouts.delete(userId);
      console.log(`✅ [SOCKET] User ${userId} reconnected within grace period. Cancellation of OFFLINE status.`);
    }

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




  socket.on("sendMessage", async (data) => {
    try {
      const { senderId, recipientId, content, messageType = "text", attachments = [], replyTo = null, tempId } = data;

      const message = await ChatService.saveMessage({
        senderId,
        recipientId,
        content,
        messageType,
        attachments,
        replyTo,
      });

      // Send to recipient
      io.to(`user-${recipientId}`).emit("newMessage", message.toJSON ? message.toJSON() : message);


      // Confirmation to sender
      socket.emit("messageDelivered", {
        _id: message._id,
        timestamp: message.timestamp,
        tempId: tempId
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
      const { groupId, senderId, content, messageType = "text", attachments = [], replyTo = null, tempId } = data;

      const message = await ChatService.saveGroupMessage({
        senderId,
        groupId,
        content,
        messageType,
        attachments,
        replyTo,
      });

      // Broadcast to group room
      io.to(`group_${groupId}`).emit("newGroupMessage", {
        ...(message.toJSON ? message.toJSON() : message),
        chatId: `group_${groupId}`
      });

      // Confirmation to sender
      socket.emit("groupMessageDelivered", {
        _id: message._id,
        groupId: message.groupId,
        timestamp: message.timestamp,
        tempId: tempId
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

  // Delete message
  socket.on("deleteMessage", async (data) => {
    try {
      const { messageId, deleteType, isGroup = false, recipientId, groupId } = data;
      const userId = socket.data.userId;
      
      const message = await ChatService.deleteMessage(messageId, userId, deleteType);
      
      if (deleteType === "everyone") {
        if (isGroup) {
          io.to(`group_${groupId}`).emit("messageDeleted", {
            messageId,
            chatId: `group_${groupId}`,
            deleteType: "everyone",
            content: "This message was deleted"
          });
        } else {
          // Emit to both sender and recipient
          const chatId = [userId, recipientId].sort().join("_");
          io.to(`user-${recipientId}`).to(`user-${userId}`).emit("messageDeleted", {
            messageId,
            chatId,
            deleteType: "everyone",
            content: "This message was deleted"
          });
        }
      } else {
        // Delete for me - only emit back to the sender
        socket.emit("messageDeleted", {
          messageId,
          chatId: isGroup ? `group_${groupId}` : [userId, recipientId].sort().join("_"),
          deleteType: "me"
        });
      }
    } catch (error) {
      console.error("Error deleting message:", error);
      socket.emit("messageError", { error: error.message });
    }
  });

  // Clear Chat
  socket.on("clearChat", async (data) => {
    try {
      const { roomId, isGroup = false } = data;
      const userId = socket.data.userId;
      
      if (!userId) throw new Error("User not authenticated");

      const targetId = isGroup ? roomId : [userId, roomId].sort().join("_");
      await ChatService.clearChat(targetId, userId, isGroup);
      
      socket.emit("chatCleared", { chatId: isGroup ? `group_${roomId}` : targetId });
    } catch (error) {
      console.error("Error clearing chat:", error);
      socket.emit("messageError", { error: error.message });
    }
  });

  // Delete Chat (messages + hide from list)
  socket.on("deleteChat", async (data) => {
    try {
      const { roomId, isGroup = false } = data;
      const userId = socket.data.userId;
      
      if (!userId) throw new Error("User not authenticated");

      const targetId = isGroup ? roomId : [userId, roomId].sort().join("_");
      await ChatService.deleteChat(targetId, userId, isGroup);
      
      socket.emit("chatDeleted", { chatId: isGroup ? `group_${roomId}` : targetId });
    } catch (error) {
      console.error("Error deleting chat:", error);
      socket.emit("messageError", { error: error.message });
    }
  });

  // Disconnect handling
  socket.on("disconnect", async (reason) => {
    console.log(`Chat socket disconnected: ${socket.id}, reason: ${reason}`);
    
    const userId = socket.data.userId;
    if (userId) {
      // Start a 5-second grace period before marking as OFFLINE
      const timeout = setTimeout(async () => {
        try {
          // Double check if they haven't reconnected by looking at the Map
          if (disconnectTimeouts.has(userId)) {
            await ChatService.updateUserStatus(userId, "OFFLINE");
            io.emit("userStatusUpdate", { 
              userId, 
              status: "OFFLINE", 
              lastSeen: new Date() 
            });
            disconnectTimeouts.delete(userId);
            console.log(`🔴 [SOCKET] User ${userId} officially MARKED OFFLINE after grace period.`);
          }
        } catch (err) {
          console.error("Error updating status on disconnect grace period:", err);
        }
      }, 5000); // 5 second grace period

      disconnectTimeouts.set(userId, timeout);
    }
  });
};
