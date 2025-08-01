const express = require('express');
const router = express.Router();
const {
  sendMessage,
  createGroupChat,
  sendGroupMessage,
  getGroupMessages,
  getUserGroupChats,
  addGroupMembers,
  removeGroupMember,
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

// Group chat routes
router.post('/groups', createGroupChat);
router.get('/groups', getUserGroupChats);
router.post('/groups/:groupId/messages', sendGroupMessage);
router.get('/groups/:groupId/messages', getGroupMessages);
router.post('/groups/:groupId/members', addGroupMembers);
router.delete('/groups/:groupId/members/:memberId', removeGroupMember);

// Chat room routes
router.get('/rooms', getChatRooms);

// User routes
router.get('/users', getAllUsersForChat);
router.get('/users/online', getOnlineUsers);
router.put('/status', updateChatStatus);

module.exports = router; 