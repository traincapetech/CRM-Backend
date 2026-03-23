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
      const chatId = [senderId.toString(), recipientId.toString()].sort().join("_");

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
        replyTo = null,
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
        replyTo,
        status: "sent",
        timestamp: new Date(),
      });

      const savedMessage = await message.save();

      // Update chat room with last message info and ENSURE IT IS NOT MARKED AS DELETED for these users
      await ChatRoom.findByIdAndUpdate(chatRoom._id, {
        lastMessage:
          content || (attachments.length > 0 ? "📎 Attachment" : "Message"),
        lastMessageTime: new Date(),
        $inc: {
          [`unreadCount.${recipientId.toString() === chatRoom.senderId.toString() ? "senderId" : "recipientId"}`]: 1,
        },
        $pull: { deletedFor: { $in: [senderId, recipientId] } }
      });

      // Populate sender, recipient, and replyTo info
      await savedMessage.populate([
        { path: "senderId", select: "fullName email profilePicture" },
        { path: "recipientId", select: "fullName email profilePicture" },
        { 
          path: "replyTo", 
          select: "content senderId",
          populate: { path: "senderId", select: "fullName" }
        }
      ]);

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
      const chatId = [senderId.toString(), recipientId.toString()].sort().join("_");
      const userObjectId = mongoose.Types.ObjectId.isValid(senderId) ? new mongoose.Types.ObjectId(senderId) : senderId;
      const userIdStr = senderId.toString();

      const query = { chatId, deletedFor: { $nin: [userObjectId, userIdStr] } };
      if (search) {
        query.content = { $regex: search, $options: "i" };
      }

      const messages = await ChatMessage.find(query)
        .populate("senderId", "fullName email profilePicture")
        .populate("recipientId", "fullName email profilePicture")
        .populate({
          path: "replyTo",
          select: "content senderId",
          populate: { path: "senderId", select: "fullName" }
        })
        .sort({ timestamp: -1 }) // Get newest messages first
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Reverse to chronological order for the frontend
      const reversedMessages = messages.reverse();

      // Mark messages as read for the recipient (only if looking at recent messages)
      if (!search && page === 1) {
        await ChatMessage.updateMany(
          {
            chatId,
            recipientId: senderId,
            "readBy.user": { $ne: senderId },
          },
          {
            $push: { readBy: { user: senderId, readAt: new Date() } },
            status: "read",
          },
        );

        // Reset unread count for the recipient
        const chatRoom = await ChatRoom.findOne({ chatId });
        if (chatRoom) {
          const field = senderId.toString() === chatRoom.senderId.toString() ? 'recipientId' : 'senderId';
          await ChatRoom.updateOne(
            { chatId },
            {
              $set: {
                [`unreadCount.${field}`]: 0,
              },
            },
          );
        }
      }

      return reversedMessages;
    } catch (error) {
      throw new Error(`Error getting chat messages: ${error.message}`);
    }
  }

  // Get user's chat rooms with last message info (OPTIMIZED)
  static async getUserChatRooms(userId) {
    try {
      // Convert userId to ObjectId if it's a string
      const userObjectId =
        typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

      // OPTIMIZATION 1: Use lean() for faster queries without full document overhead
      // OPTIMIZATION 2: Limit to recent chat rooms (last 30 days) to reduce data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const chatRooms = await ChatRoom.find({
        $or: [{ senderId: userObjectId }, { recipientId: userObjectId }],
        lastMessageTime: { $gte: thirtyDaysAgo }, // Only recent chats
        deletedFor: { $ne: userObjectId }, // Filter out deleted rooms
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

      // Format the response and calculate unread counts in parallel
      const roomPromises = chatRooms.map(async (room) => {
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

        // Dynamically calculate unread count for DM to ensure accuracy
        const unreadCount = await ChatMessage.countDocuments({
          chatId: room.chatId,
          recipientId: userObjectId,
          senderId: { $ne: userObjectId },
          "readBy.user": { $ne: userObjectId },
          deletedFor: { $nin: [userObjectId, userIdStr] } // Also filter out unread messages that were deleted for me
        });

        // Get the real last message that isn't deleted for this user
        const lastValidMsg = await ChatMessage.findOne({
          chatId: room.chatId,
          deletedFor: { $nin: [userObjectId, userIdStr] }
        }).sort({ timestamp: -1 }).lean();

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
          lastMessage: lastValidMsg ? (lastValidMsg.deletedEveryone ? "This message was deleted" : (lastValidMsg.content || (lastValidMsg.attachments?.length > 0 ? "📎 Attachment" : "Message"))) : "No messages",
          lastMessageTime: lastValidMsg ? lastValidMsg.timestamp : room.lastMessageTime,
          unreadCount: unreadCount,
        };
      });

      const formattedRooms = (await Promise.all(roomPromises)).filter((room) => room !== null);
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
      const chatId = [senderId.toString(), recipientId.toString()].sort().join("_");

      // Update messages
      await ChatMessage.updateMany(
        {
          chatId,
          recipientId,
          "readBy.user": { $ne: recipientId },
        },
        {
          $push: { readBy: { user: recipientId, readAt: new Date() } },
          status: "read",
        },
      );

      // Reset unread count for the recipient
      const chatRoom = await ChatRoom.findOne({ chatId });
      if (chatRoom) {
        const field = recipientId.toString() === chatRoom.senderId.toString() ? 'senderId' : 'recipientId';
        await ChatRoom.updateOne(
          { chatId },
          {
            $set: {
              [`unreadCount.${field}`]: 0,
            },
          },
        );
      }
    } catch (error) {
      throw new Error(`Error marking messages as read: ${error.message}`);
    }
  }

  // Mark group messages as read
  static async markGroupMessagesAsRead(groupId, userId) {
    try {
      await ChatMessage.updateMany(
        {
          groupId,
          "readBy.user": { $ne: userId },
        },
        {
          $push: { readBy: { user: userId, readAt: new Date() } },
          status: "read", // Also update status for consistency
        },
      );
    } catch (error) {
      throw new Error(`Error marking group messages as read: ${error.message}`);
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

      try {
        await groupChat.save();
      } catch (err) {
        if (err.message && err.message.includes('groupId_1 dup key')) {
          console.warn("Detected rogue groupId_1 index, dropping it...");
          await GroupChat.collection.dropIndex('groupId_1').catch(() => {});
          await groupChat.save();
        } else {
          throw err;
        }
      }

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
        isActive: true,
        deletedFor: { $ne: userId }
      })
      .populate('members.user', 'fullName email profilePicture')
      .populate('lastMessage.sender', 'fullName')
      .sort({ updatedAt: -1 })
      .lean();

      // Dynamically calculate unread count for each group
      const groupsWithUnread = await Promise.all(groups.map(async (group) => {
        const unreadCount = await ChatMessage.countDocuments({
          groupId: group._id,
          senderId: { $ne: userId }, // Don't count own messages as unread
          "readBy.user": { $ne: userId },
          deletedFor: { $nin: [mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId, userId.toString()] }
        });
        return { ...group, unreadCount };
      }));

      return groupsWithUnread;
    } catch (error) {
      throw new Error(`Error fetching user groups: ${error.message}`);
    }
  }

  // Get group messages
  static async getGroupMessages(groupId, userId, page = 1, limit = 50) {
    try {
      const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      const userIdStr = userId.toString();
      const messages = await ChatMessage.find({ 
        groupId, 
        deletedFor: { $nin: [userObjectId, userIdStr] } 
      })
        .populate("senderId", "fullName email profilePicture")
        .populate({
          path: "replyTo",
          select: "content senderId",
          populate: { path: "senderId", select: "fullName" }
        })
        .sort({ timestamp: -1 }) // Get newest first
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const reversedMessages = messages.reverse();
      
      // Automatically mark as read if fetching first page
      if (page === 1) {
        await this.markGroupMessagesAsRead(groupId, userId);
      }

      return reversedMessages;
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
        replyTo: messageData.replyTo,
        status: "sent",
        timestamp: new Date(),
      });

      const savedMessage = await message.save();

      // Update group last message and RESTORE for anyone who had deleted it
      await GroupChat.findByIdAndUpdate(groupId, {
        lastMessage: {
          content: content || (attachments.length > 0 ? "📎 Attachment" : "Group Message"),
          sender: senderId,
          timestamp: new Date()
        },
        $set: { deletedFor: [] }
      });

      await savedMessage.populate([
        { path: "senderId", select: "fullName email profilePicture" },
        { 
          path: "replyTo", 
          select: "content senderId",
          populate: { path: "senderId", select: "fullName" }
        }
      ]);
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

  // Delete message (WhatsApp style)
  static async deleteMessage(messageId, userId, deleteType) {
    try {
      const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      const message = await ChatMessage.findById(messageId);
      if (!message) throw new Error("Message not found");

      if (deleteType === "everyone") {
        if (message.senderId.toString() !== userId.toString()) {
          throw new Error("You can only delete your own messages for everyone");
        }
        const diffInHours = (new Date() - new Date(message.timestamp)) / (1000 * 60 * 60);
        if (diffInHours > 24) throw new Error("Cannot delete for everyone after 24 hours");
        message.deletedEveryone = true;
        message.content = "This message was deleted";
        message.attachments = [];
        message.isDeleted = true;
      } else {
        if (!message.deletedFor.some(id => id.toString() === userObjectId.toString())) {
          message.deletedFor.push(userObjectId);
        }
      }
      await message.save();
      return message;
    } catch (error) {
      throw new Error(`Error deleting message: ${error.message}`);
    }
  }

  // Clear chat history for a user
  static async clearChat(roomId, userId, isGroup = false) {
    try {
      const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      const query = isGroup ? { groupId: roomId } : { chatId: roomId };
      
      // Use $addToSet to ensure no duplicates and ensure we match both formats in the query
      await ChatMessage.updateMany(
        { ...query, deletedFor: { $nin: [userObjectId, userId.toString()] } }, 
        { $addToSet: { deletedFor: userObjectId } }
      );
      return true;
    } catch (error) {
      throw new Error(`Error clearing chat: ${error.message}`);
    }
  }

  // Delete chat (messages + hide from list)
  static async deleteChat(roomId, userId, isGroup = false) {
    try {
      const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      
      // 1. Clear messages for this user
      await this.clearChat(roomId, userId, isGroup);

      // 2. Add user to deletedFor of the room/group
      if (isGroup) {
        await GroupChat.findByIdAndUpdate(roomId, {
          $addToSet: { deletedFor: userObjectId }
        });
      } else {
        // Find by chatId (format: user1_user2)
        await ChatRoom.findOneAndUpdate(
          { chatId: roomId },
          { $addToSet: { deletedFor: userObjectId } }
        );
      }
      return true;
    } catch (error) {
      throw new Error(`Error deleting chat: ${error.message}`);
    }
  }
}

module.exports = ChatService;