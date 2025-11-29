const mongoose = require('mongoose');
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');

class ChatService {
  // Create or get existing chat room between two users
  static async getOrCreateChatRoom(senderId, recipientId) {
    try {
      // Create a consistent chatId regardless of who initiates
      const chatId = [senderId, recipientId].sort().join('_');
      
      // Check if chat room already exists
      let chatRoom = await ChatRoom.findOne({ chatId });
      
      if (!chatRoom) {
        // Create new chat room
        chatRoom = new ChatRoom({
          chatId,
          senderId,
          recipientId
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
      const { senderId, recipientId, content, messageType = 'text' } = messageData;
      
      // Get or create chat room
      const chatRoom = await this.getOrCreateChatRoom(senderId, recipientId);
      
      // Create new message
      const message = new ChatMessage({
        chatId: chatRoom.chatId,
        senderId,
        recipientId,
        content,
        messageType,
        timestamp: new Date()
      });
      
      const savedMessage = await message.save();
      
      // Update chat room with last message info
      await ChatRoom.findByIdAndUpdate(chatRoom._id, {
        lastMessage: content,
        lastMessageTime: new Date(),
        $inc: {
          [`unreadCount.${recipientId === chatRoom.senderId ? 'senderId' : 'recipientId'}`]: 1
        }
      });
      
      // Populate sender and recipient info
      await savedMessage.populate('senderId', 'fullName email profilePicture');
      await savedMessage.populate('recipientId', 'fullName email profilePicture');
      
      return savedMessage;
    } catch (error) {
      throw new Error(`Error saving message: ${error.message}`);
    }
  }

  // Get chat messages between two users
  static async getChatMessages(senderId, recipientId, page = 1, limit = 50) {
    try {
      const chatId = [senderId, recipientId].sort().join('_');
      
      const messages = await ChatMessage.find({ chatId })
        .populate('senderId', 'fullName email profilePicture')
        .populate('recipientId', 'fullName email profilePicture')
        .sort({ timestamp: 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
      
      // Mark messages as read for the recipient
      await ChatMessage.updateMany(
        { 
          chatId, 
          recipientId: senderId, 
          isRead: false 
        },
        { isRead: true }
      );
      
      // Reset unread count for the recipient
      await ChatRoom.updateOne(
        { chatId },
        { 
          $set: {
            [`unreadCount.${senderId}`]: 0
          }
        }
      );
      
      return messages;
    } catch (error) {
      throw new Error(`Error getting chat messages: ${error.message}`);
    }
  }

  // Get user's chat rooms with last message info (OPTIMIZED)
  static async getUserChatRooms(userId) {
    try {
      // Convert userId to ObjectId if it's a string
      const userObjectId = typeof userId === 'string' ? mongoose.Types.ObjectId(userId) : userId;

      // OPTIMIZATION 1: Use lean() for faster queries without full document overhead
      // OPTIMIZATION 2: Limit to recent chat rooms (last 30 days) to reduce data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const chatRooms = await ChatRoom.find({
        $or: [
          { senderId: userObjectId },
          { recipientId: userObjectId }
        ],
        lastMessageTime: { $gte: thirtyDaysAgo } // Only recent chats
      })
      .populate('senderId', 'fullName email profilePicture chatStatus lastSeen')
      .populate('recipientId', 'fullName email profilePicture chatStatus lastSeen')
      .sort({ lastMessageTime: -1 })
      .limit(20) // OPTIMIZATION 3: Limit to 20 most recent chats
      .lean(); // OPTIMIZATION 4: Use lean() for faster queries
      
      // Format the response to include the other user's info
      const formattedRooms = chatRooms.map(room => {
        const otherUser = room.senderId._id.toString() === userObjectId.toString() 
          ? room.recipientId 
          : room.senderId;
        
        // Check if otherUser exists before accessing its properties
        if (!otherUser) {
          return null;
        }
        
        const unreadCount = room.senderId._id.toString() === userObjectId.toString()
          ? room.unreadCount.senderId
          : room.unreadCount.recipientId;
        
        return {
          chatId: room.chatId,
          otherUser: {
            _id: otherUser._id,
            fullName: otherUser.fullName,
            email: otherUser.email,
            profilePicture: otherUser.profilePicture,
            chatStatus: otherUser.chatStatus,
            lastSeen: otherUser.lastSeen
          },
          lastMessage: room.lastMessage,
          lastMessageTime: room.lastMessageTime,
          unreadCount
        };
      }).filter(room => room !== null); // Filter out null rooms
      
      return formattedRooms;
    } catch (error) {
      throw new Error(`Error getting user chat rooms: ${error.message}`);
    }
  }

  // Update user chat status
  static async updateUserStatus(userId, status) {
    try {
      await User.findByIdAndUpdate(userId, {
        chatStatus: status,
        lastSeen: new Date()
      });
    } catch (error) {
      throw new Error(`Error updating user status: ${error.message}`);
    }
  }

  // Get online users
  static async getOnlineUsers(excludeUserId = null) {
    try {
      const query = { chatStatus: 'ONLINE' };
      if (excludeUserId) {
        query._id = { $ne: excludeUserId };
      }
      
      const users = await User.find(query)
        .select('fullName email profilePicture chatStatus lastSeen role')
        .sort({ fullName: 1 });
      
      return users;
    } catch (error) {
      throw new Error(`Error getting online users: ${error.message}`);
    }
  }

  // Get all users for chat (excluding current user)
  static async getAllUsersForChat(excludeUserId) {
    try {
      const users = await User.find({ _id: { $ne: excludeUserId } })
        .select('fullName email profilePicture chatStatus lastSeen role')
        .sort({ fullName: 1 });
      
      return users;
    } catch (error) {
      throw new Error(`Error getting users for chat: ${error.message}`);
    }
  }
}

module.exports = ChatService; 