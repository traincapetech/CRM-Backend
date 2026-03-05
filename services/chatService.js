const mongoose = require("mongoose");
const ChatRoom = require("../models/ChatRoom");
const ChatMessage = require("../models/ChatMessage");
const GroupChat = require("../models/GroupChat");
const User = require("../models/User");

class ChatService {
  // Create or get existing chat room between two users
  static async getOrCreateChatRoom(senderId, recipientId) {
    try {
      // Create a consistent chatId regardless of who initiates
      const chatId = [senderId, recipientId].sort().join("_");

      // Check if chat room already exists
      let chatRoom = await ChatRoom.findOne({ chatId });

      if (!chatRoom) {
        // Create new chat room
        chatRoom = new ChatRoom({
          chatId,
          senderId,
          recipientId,
        });
        await chatRoom.save();
      }

      return chatRoom;
    } catch (error) {
      throw new Error(`Error creating/getting chat room: ${error.message}`);
    }
  }

  // Save a chat message
  static async saveMessage(messageData) {
    try {
      const {
        senderId,
        recipientId,
        content,
        messageType = "text",
        attachments = [],
      } = messageData;

      // Get or create chat room
      const chatRoom = await this.getOrCreateChatRoom(senderId, recipientId);

      // Create new message
      const message = new ChatMessage({
        chatId: chatRoom.chatId,
        senderId,
        recipientId,
        content,
        messageType,
        attachments,
        status: "sent",
        timestamp: new Date(),
      });

      const savedMessage = await message.save();

      // Update chat room with last message info
      await ChatRoom.findByIdAndUpdate(chatRoom._id, {
        lastMessage:
          content || (attachments.length > 0 ? "📎 Attachment" : "Message"),
        lastMessageTime: new Date(),
        $inc: {
          [`unreadCount.${recipientId === chatRoom.senderId ? "senderId" : "recipientId"}`]: 1,
        },
      });

      // Populate sender and recipient info
      await savedMessage.populate("senderId", "fullName email profilePicture");
      await savedMessage.populate(
        "recipientId",
        "fullName email profilePicture",
      );

      return savedMessage;
    } catch (error) {
      throw new Error(`Error saving message: ${error.message}`);
    }
  }

  // Get chat messages between two users
  static async getChatMessages(
    senderId,
    recipientId,
    page = 1,
    limit = 50,
    search = "",
  ) {
    try {
      const chatId = [senderId, recipientId].sort().join("_");

      const query = { chatId };
      if (search) {
        query.content = { $regex: search, $options: "i" };
      }

      const messages = await ChatMessage.find(query)
        .populate("senderId", "fullName email profilePicture")
        .populate("recipientId", "fullName email profilePicture")
        .sort({ timestamp: 1 })
        // If searching, we might want to return all matches or paginate differently,
        // but for now keeping pagination
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Mark messages as read for the recipient (only if looking at recent messages)
      if (!search && page === 1) {
        await ChatMessage.updateMany(
          {
            chatId,
            recipientId: senderId,
            isRead: false,
          },
          {
            isRead: true,
            status: "read",
            readAt: new Date(),
          },
        );

        // Reset unread count for the recipient
        await ChatRoom.updateOne(
          { chatId },
          {
            $set: {
              [`unreadCount.${senderId}`]: 0,
            },
          },
        );
      }

      return messages;
    } catch (error) {
      throw new Error(`Error getting chat messages: ${error.message}`);
    }
  }

  // Get user's chat rooms with last message info (OPTIMIZED)
  static async getUserChatRooms(userId) {
    try {
      // Convert userId to ObjectId if it's a string
      const userObjectId =
        typeof userId === "string" ? mongoose.Types.ObjectId(userId) : userId;

      // OPTIMIZATION 1: Use lean() for faster queries without full document overhead
      // OPTIMIZATION 2: Limit to recent chat rooms (last 30 days) to reduce data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const chatRooms = await ChatRoom.find({
        $or: [{ senderId: userObjectId }, { recipientId: userObjectId }],
        lastMessageTime: { $gte: thirtyDaysAgo }, // Only recent chats
      })
        .populate(
          "senderId",
          "fullName email profilePicture chatStatus lastSeen",
        )
        .populate(
          "recipientId",
          "fullName email profilePicture chatStatus lastSeen",
        )
        .sort({ lastMessageTime: -1 })
        .limit(20) // OPTIMIZATION 3: Limit to 20 most recent chats
        .lean(); // OPTIMIZATION 4: Use lean() for faster queries

      // Format the response to include the other user's info
      const formattedRooms = chatRooms
        .map((room) => {
          // Safety checks for populated fields
          if (!room.senderId || !room.recipientId) {
            console.warn(`Chat room ${room.chatId} has missing user data`);
            return null;
          }

          const senderIdStr = room.senderId._id
            ? room.senderId._id.toString()
            : room.senderId.toString();
          const userIdStr = userObjectId.toString();

          const isSender = senderIdStr === userIdStr;
          const otherUser = isSender ? room.recipientId : room.senderId;

          // Check if otherUser exists before accessing its properties
          if (!otherUser || typeof otherUser !== "object") {
            return null;
          }

          const unreadCount = isSender
            ? room.unreadCount
              ? room.unreadCount.senderId
              : 0
            : room.unreadCount
              ? room.unreadCount.recipientId
              : 0;

          return {
            chatId: room.chatId,
            otherUser: {
              _id: otherUser._id,
              fullName: otherUser.fullName || "Unknown User",
              email: otherUser.email,
              profilePicture: otherUser.profilePicture,
              chatStatus: otherUser.chatStatus,
              lastSeen: otherUser.lastSeen,
            },
            lastMessage: room.lastMessage,
            lastMessageTime: room.lastMessageTime,
            unreadCount: unreadCount || 0,
          };
        })
        .filter((room) => room !== null); // Filter out null rooms

      return formattedRooms;
    } catch (error) {
      console.error("Critical error in getUserChatRooms:", error);
      return []; // Return empty array instead of throwing to prevent crashing the whole response
    }
  }

  // Update user chat status
  static async updateUserStatus(userId, status) {
    try {
      await User.findByIdAndUpdate(userId, {
        chatStatus: status,
        lastSeen: new Date(),
      });
    } catch (error) {
      throw new Error(`Error updating user status: ${error.message}`);
    }
  }

  // Get online users
  static async getOnlineUsers(excludeUserId = null) {
    try {
      const query = { chatStatus: "ONLINE", active: true }; // Filter out inactive users
      if (excludeUserId) {
        query._id = { $ne: excludeUserId };
      }

      const users = await User.find(query)
        .select("fullName email profilePicture chatStatus lastSeen role")
        .sort({ fullName: 1 });

      return users;
    } catch (error) {
      throw new Error(`Error getting online users: ${error.message}`);
    }
  }

  // Get all users for chat (excluding current user)
  static async getAllUsersForChat(excludeUserId) {
    try {
      const users = await User.find({
        _id: { $ne: excludeUserId },
        active: true, // Filter out inactive users
      })
        .select("fullName email profilePicture chatStatus lastSeen role")
        .sort({ fullName: 1 });

      return users;
    } catch (error) {
      throw new Error(`Error getting users for chat: ${error.message}`);
    }
  }

  // Mark messages as read
  static async markMessagesAsRead(senderId, recipientId) {
    try {
      const chatId = [senderId, recipientId].sort().join("_");

      // Update messages
      await ChatMessage.updateMany(
        {
          chatId,
          recipientId,
          isRead: false,
        },
        {
          isRead: true,
          status: "read",
          readAt: new Date(),
        },
      );

      // Reset unread count for the recipient
      await ChatRoom.updateOne(
        { chatId },
        {
          $set: {
            [`unreadCount.${recipientId}`]: 0,
          },
        },
      );
    } catch (error) {
      throw new Error(`Error marking messages as read: ${error.message}`);
    }
  }

  // Group Chat Methods

  // Create a new group
  static async createGroup(data, creatorId) {
    try {
      const { name, description, members = [] } = data;

      // Ensure creator is in members list
      const memberIds = [...new Set([creatorId, ...members])];

      const formattedMembers = memberIds.map(id => ({
        user: id,
        role: id.toString() === creatorId.toString() ? 'admin' : 'member',
        joinedAt: new Date()
      }));

      const groupChat = new GroupChat({
        name,
        description,
        createdBy: creatorId,
        admins: [creatorId],
        members: formattedMembers
      });

      await groupChat.save();
      return await groupChat.populate('members.user', 'fullName email profilePicture');
    } catch (error) {
      throw new Error(`Error creating group: ${error.message}`);
    }
  }

  // Get user's groups
  static async getUserGroups(userId) {
    try {
      const groups = await GroupChat.find({
        'members.user': userId,
        isActive: true
      })
      .populate('members.user', 'fullName email profilePicture')
      .populate('lastMessage.sender', 'fullName')
      .sort({ updatedAt: -1 });

      return groups;
    } catch (error) {
      throw new Error(`Error fetching user groups: ${error.message}`);
    }
  }

  // Get group messages
  static async getGroupMessages(groupId, page = 1, limit = 50) {
    try {
      const messages = await ChatMessage.find({ groupId })
        .populate("senderId", "fullName email profilePicture")
        .sort({ timestamp: 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      return messages;
    } catch (error) {
      throw new Error(`Error getting group messages: ${error.message}`);
    }
  }

  // Save group message
  static async saveGroupMessage(messageData) {
    try {
      const {
        senderId,
        groupId,
        content,
        messageType = "text",
        attachments = [],
      } = messageData;

      // Verify membership
      const group = await GroupChat.findOne({ _id: groupId, 'members.user': senderId });
      if (!group) throw new Error("User is not a member of this group");

      const message = new ChatMessage({
        chatId: `group_${groupId}`, // Unified chatId for groups
        senderId,
        groupId,
        content,
        messageType,
        attachments,
        status: "sent",
        timestamp: new Date(),
      });

      const savedMessage = await message.save();

      // Update group last message
      await GroupChat.findByIdAndUpdate(groupId, {
        lastMessage: {
          content: content || (attachments.length > 0 ? "📎 Attachment" : "Group Message"),
          sender: senderId,
          timestamp: new Date()
        }
      });

      await savedMessage.populate("senderId", "fullName email profilePicture");
      return savedMessage;
    } catch (error) {
      throw new Error(`Error saving group message: ${error.message}`);
    }
  }

  // Add group member
  static async addGroupMember(groupId, userId, requesterId) {
    try {
      const group = await GroupChat.findById(groupId);
      if (!group) throw new Error("Group not found");

      // Check if requester is admin
      const isAdmin = group.admins.some(id => id.toString() === requesterId.toString());
      if (!isAdmin && !group.settings.allowMemberInvite) {
        throw new Error("Only admins can invite members to this group");
      }

      // Check if user is already a member
      if (group.members.some(m => m.user.toString() === userId.toString())) {
        throw new Error("User is already a member");
      }

      group.members.push({ user: userId, role: 'member', joinedAt: new Date() });
      await group.save();
      return await group.populate('members.user', 'fullName email profilePicture');
    } catch (error) {
      throw new Error(`Error adding group member: ${error.message}`);
    }
  }

  // Remove group member
  static async removeGroupMember(groupId, userId, requesterId) {
    try {
      const group = await GroupChat.findById(groupId);
      if (!group) throw new Error("Group not found");

      const isAdmin = group.admins.some(id => id.toString() === requesterId.toString());
      const isSelf = userId.toString() === requesterId.toString();

      if (!isAdmin && !isSelf) {
        throw new Error("Permission denied");
      }

      group.members = group.members.filter(m => m.user.toString() !== userId.toString());
      
      // If the removed user was an admin, remove from admins array too
      group.admins = group.admins.filter(id => id.toString() !== userId.toString());

      // If no members left, deactivate group
      if (group.members.length === 0) {
        group.isActive = false;
      }

      await group.save();
      return group;
    } catch (error) {
      throw new Error(`Error removing group member: ${error.message}`);
    }
  }
}

module.exports = ChatService;