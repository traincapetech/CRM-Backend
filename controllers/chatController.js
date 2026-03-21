const ChatService = require("../services/chatService");
const User = require("../models/User");
const ChatMessage = require("../models/ChatMessage");
const { uploadFile } = require("../services/fileStorageService");

// @desc    Send a message
// @route   POST /api/chat/messages
// @access  Private
const sendMessage = async (req, res) => {
  try {
    const { recipientId, content, messageType, attachments } = req.body;
    const senderId = req.user._id;

    if (
      !recipientId ||
      (!content && (!attachments || attachments.length === 0))
    ) {
      return res.status(400).json({
        success: false,
        message: "Recipient ID and content (or attachments) are required",
      });
    }

    const message = await ChatService.saveMessage({
      senderId,
      recipientId,
      content,
      messageType,
      attachments,
    });

    // Emit the message via Socket.IO
    const io = req.app.get("io");
    if (io) {
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
        status: message.status,
        readBy: message.readBy,
      });

      // Send notification to recipient
      io.to(`user-${recipientId}`).emit("messageNotification", {
        senderId: message.senderId,
        senderName: message.senderId.fullName,
        content: message.content || "📎 Attachment",
        timestamp: message.timestamp,
      });
    }

    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get chat messages between two users
// @route   GET /api/chat/messages/:recipientId
// @access  Private
const getChatMessages = async (req, res) => {
  try {
    const { recipientId } = req.params;
    const senderId = req.user._id;
    const { page = 1, limit = 50, search = "" } = req.query;

    const messages = await ChatService.getChatMessages(
      senderId,
      recipientId,
      parseInt(page),
      parseInt(limit),
      search,
    );

    res.status(200).json({
      success: true,
      data: messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: messages.length,
      },
    });
  } catch (error) {
    console.error("Error getting chat messages:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get user's chat rooms
// @route   GET /api/chat/rooms
// @access  Private
const getChatRooms = async (req, res) => {
  try {
    const userId = req.user._id;
    const chatRooms = await ChatService.getUserChatRooms(userId);

    res.status(200).json({
      success: true,
      data: chatRooms,
    });
  } catch (error) {
    console.error("Error getting chat rooms:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get online users
// @route   GET /api/chat/users/online
// @access  Private
const getOnlineUsers = async (req, res) => {
  try {
    const userId = req.user._id;
    const users = await ChatService.getOnlineUsers(userId);

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Error getting online users:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all users for chat (OPTIMIZED)
// @route   GET /api/chat/users
// @access  Private
const getAllUsersForChat = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    // Get IDs of employees who are terminated or have completed their internship
    const Employee = require("../models/Employee");
    const inactiveEmployees = await Employee.find({
      status: { $in: ["TERMINATED", "COMPLETED"] },
    }).select("_id");
    const inactiveEmployeeIds = inactiveEmployees.map((emp) => emp._id);

    // Get all users except current user, excluding terminated/inactive employees
    const users = await User.find({
      _id: { $ne: currentUserId },
      active: { $ne: false },
      employeeId: { $nin: inactiveEmployeeIds },
    })
      .select(
        "fullName email role chatStatus lastSeen profilePicture active createdAt",
      )
      .lean()
      .limit(500);

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Error fetching users for chat:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching users for chat",
    });
  }
};

// @desc    Update user chat status
// @route   PUT /api/chat/status
// @access  Private
const updateChatStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.user._id;

    if (!["ONLINE", "OFFLINE", "AWAY"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be ONLINE, OFFLINE, or AWAY",
      });
    }

    await ChatService.updateUserStatus(userId, status);

    // Emit status update via Socket.IO
    const io = req.app.get("io");
    if (io) {
      io.emit("userStatusUpdate", {
        userId,
        status,
        lastSeen: new Date(),
      });
    }

    res.status(200).json({
      success: true,
      message: "Status updated successfully",
    });
  } catch (error) {
    console.error("Error updating chat status:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Mark messages as read
// @route   PUT /api/chat/messages/read/:senderId
// @access  Private
const markMessagesAsRead = async (req, res) => {
  try {
    const { senderId } = req.params;
    const recipientId = req.user._id;

    await ChatService.markMessagesAsRead(senderId, recipientId);

    // Notify sender in real-time that their messages were read
    const io = req.app.get("io");
    if (io) {
      const chatId = [senderId.toString(), recipientId.toString()]
        .sort()
        .join("_");

      io.to(senderId.toString()).emit("messagesRead", {
        chatId,
        readerId: recipientId,
      });
    }

    res.status(200).json({
      success: true,
      message: "Messages marked as read",
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Mark group messages as read
// @route   PUT /api/chat/groups/:groupId/read
// @access  Private
const markGroupMessagesAsRead = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    await ChatService.markGroupMessagesAsRead(groupId, userId);

    // Notify group members in real-time
    const io = req.app.get("io");
    if (io) {
      io.to(`group_${groupId}`).emit("groupMessagesRead", {
        groupId,
        readerId: userId,
      });
    }

    res.status(200).json({
      success: true,
      message: "Group messages marked as read",
    });
  } catch (error) {
    console.error("Error marking group messages as read:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  sendMessage,
  getChatMessages,
  getChatRooms,
  getOnlineUsers,
  getAllUsersForChat,
  updateChatStatus,
  markMessagesAsRead,
  markGroupMessagesAsRead,
  editMessage: async (req, res) => {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const userId = req.user._id;

      const message = await ChatMessage.findById(id);
      if (!message) return res.status(404).json({ success: false, message: "Message not found" });

      if (message.senderId.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: "Unauthorized to edit this message" });
      }

      // Add to history
      message.editHistory.push({
        content: message.content,
        editedAt: new Date(),
      });

      message.content = content;
      message.isEdited = true;
      await message.save();

      // Emit socket event
      const io = req.app.get("io");
      if (io) {
        const target = message.groupId ? `group_${message.groupId}` : `user-${message.recipientId}`;
        io.to(target).emit("messageEdited", {
          _id: message._id,
          content: message.content,
          isEdited: true,
          editHistory: message.editHistory,
        });
        
        // Also notify the sender for multi-device sync
        io.to(`user-${message.senderId}`).emit("messageEdited", {
          _id: message._id,
          content: message.content,
          isEdited: true,
        });
      }

      res.status(200).json({ success: true, data: message });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  deleteMessage: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const message = await ChatMessage.findById(id);
      if (!message) return res.status(404).json({ success: false, message: "Message not found" });

      if (message.senderId.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: "Unauthorized to delete this message" });
      }

      message.isDeleted = true;
      // We don't wipe the content to keep audit trail, but UI will hide it
      await message.save();

      // Emit socket event
      const io = req.app.get("io");
      if (io) {
        const target = message.groupId ? `group_${message.groupId}` : `user-${message.recipientId}`;
        io.to(target).emit("messageDeleted", { _id: message._id });
        io.to(`user-${message.senderId}`).emit("messageDeleted", { _id: message._id });
      }

      res.status(200).json({ success: true, message: "Message deleted" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  uploadAttachment: async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      // Use fileStorageService to handle upload (R2 or Local)
      const uploadResult = await uploadFile(req.file, "chat");

      res.status(200).json({
        success: true,
        data: {
          url: uploadResult.url,
          fileName: req.file.originalname,
          fileType: req.file.mimetype,
          fileSize: req.file.size,
        },
      });
    } catch (error) {
      console.error("Error uploading chat attachment:", error);
      res.status(500).json({
        success: false,
        message: "Error uploading file",
      });
    }
  },
  toggleReaction: async (req, res) => {
    try {
      const { id } = req.params;
      const { emoji } = req.body;
      const userId = req.user._id;

      const message = await ChatMessage.findById(id);
      if (!message) {
        return res.status(404).json({ success: false, message: "Message not found" });
      }

      // Find if this emoji already exists in reactions
      const reactionIndex = message.reactions.findIndex((r) => r.emoji === emoji);

      if (reactionIndex === -1) {
        // Emoji not found, add new reaction with this user
        message.reactions.push({ emoji, users: [userId] });
      } else {
        // Emoji found, check if user already reacted
        const userIndex = message.reactions[reactionIndex].users.indexOf(userId);

        if (userIndex === -1) {
          // User hasn't reacted with this emoji, add them
          message.reactions[reactionIndex].users.push(userId);
        } else {
          // User already reacted, remove them (toggle off)
          message.reactions[reactionIndex].users.splice(userIndex, 1);

          // If no users left for this emoji, remove the emoji entry entirely
          if (message.reactions[reactionIndex].users.length === 0) {
            message.reactions.splice(reactionIndex, 1);
          }
        }
      }

      await message.save();

      // Format reactions to include count for the frontend
      const formattedReactions = message.reactions.map(r => ({
        emoji: r.emoji,
        users: r.users,
        count: r.users.length
      }));

      // Emit socket event for real-time update
      const io = req.app.get("io");
      if (io) {
        // Broadcast to the chat room (recipient and sender)
        const target = message.groupId ? `group_${message.groupId}` : `user-${message.recipientId}`;
        io.to(target).emit("messageReaction", {
          _id: message._id,
          reactions: formattedReactions,
        });

        // Also notify the sender for multi-device sync if it's a DM and they aren't the recipient
        if (!message.groupId && message.senderId.toString() !== message.recipientId?.toString()) {
          io.to(`user-${message.senderId}`).emit("messageReaction", {
            _id: message._id,
            reactions: formattedReactions,
          });
        }
      }

      res.status(200).json({ success: true, data: formattedReactions });
    } catch (error) {
      console.error("Error toggling reaction:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  },
};
