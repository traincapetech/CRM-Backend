const ChatService = require('../services/chatService');
const User = require('../models/User');

// @desc    Send a message
// @route   POST /api/chat/messages
// @access  Private
const sendMessage = async (req, res) => {
  try {
    const { recipientId, content, messageType } = req.body;
    const senderId = req.user._id;

    if (!recipientId || !content) {
      return res.status(400).json({
        success: false,
        message: 'Recipient ID and content are required'
      });
    }

    const message = await ChatService.saveMessage({
      senderId,
      recipientId,
      content,
      messageType
    });

    // Emit the message via Socket.IO
    const io = req.app.get('io');
    if (io) {
      // Send to recipient
      io.to(`user-${recipientId}`).emit('newMessage', {
        _id: message._id,
        chatId: message.chatId,
        senderId: message.senderId,
        recipientId: message.recipientId,
        content: message.content,
        messageType: message.messageType,
        timestamp: message.timestamp,
        isRead: message.isRead
      });

      // Send notification to recipient
      io.to(`user-${recipientId}`).emit('messageNotification', {
        senderId: message.senderId,
        senderName: message.senderId.fullName,
        content: message.content,
        timestamp: message.timestamp
      });
    }

    res.status(201).json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: error.message
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
    const { page = 1, limit = 50 } = req.query;

    const messages = await ChatService.getChatMessages(
      senderId,
      recipientId,
      parseInt(page),
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      data: messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: messages.length
      }
    });
  } catch (error) {
    console.error('Error getting chat messages:', error);
    res.status(500).json({
      success: false,
      message: error.message
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
      data: chatRooms
    });
  } catch (error) {
    console.error('Error getting chat rooms:', error);
    res.status(500).json({
      success: false,
      message: error.message
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
      data: users
    });
  } catch (error) {
    console.error('Error getting online users:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Simple in-memory cache for users (expires after 5 minutes)
let usersCache = null;
let usersCacheExpiry = null;

// @desc    Get all users for chat (OPTIMIZED with caching)
// @route   GET /api/chat/users
// @access  Private
const getAllUsersForChat = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    
    // OPTIMIZATION: Check cache first
    const now = Date.now();
    if (usersCache && usersCacheExpiry && now < usersCacheExpiry) {
      console.log('Returning cached users data');
      return res.status(200).json({
        success: true,
        data: usersCache
      });
    }
    
    // Get all users except current user, including customers
    const users = await User.find({ 
      _id: { $ne: currentUserId } 
    })
    .select('fullName email role chatStatus lastSeen profilePicture createdAt')
    .lean() // OPTIMIZATION: Use lean() for faster queries
    .limit(100); // OPTIMIZATION: Limit to 100 users max

    // OPTIMIZATION: Cache the results for 5 minutes
    usersCache = users;
    usersCacheExpiry = now + (5 * 60 * 1000); // 5 minutes

    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error fetching users for chat:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users for chat'
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

    if (!['ONLINE', 'OFFLINE', 'AWAY'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be ONLINE, OFFLINE, or AWAY'
      });
    }

    await ChatService.updateUserStatus(userId, status);

    // Emit status update via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('userStatusUpdate', {
        userId,
        status,
        lastSeen: new Date()
      });
    }

    res.status(200).json({
      success: true,
      message: 'Status updated successfully'
    });
  } catch (error) {
    console.error('Error updating chat status:', error);
    res.status(500).json({
      success: false,
      message: error.message
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

    // This is handled automatically in getChatMessages, but we can also provide a separate endpoint
    await ChatService.getChatMessages(recipientId, senderId, 1, 1);

    res.status(200).json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({
      success: false,
      message: error.message
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
  markMessagesAsRead
}; 