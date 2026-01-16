const express = require('express');
const router = express.Router();
const {
  sendMessage,
  getChatMessages,
  getChatRooms,
  getOnlineUsers,
  getAllUsersForChat,
  updateChatStatus,
  markMessagesAsRead
} = require('../controllers/chatController');

const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Message routes
router.post('/messages', sendMessage);
router.get('/messages/:recipientId', getChatMessages);
router.put('/messages/read/:senderId', markMessagesAsRead);

// Chat room routes
router.get('/rooms', getChatRooms);

// User routes
router.get('/users', getAllUsersForChat);
router.get('/users/online', getOnlineUsers);
router.put('/status', updateChatStatus);

module.exports = router; 