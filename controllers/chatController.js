const ChatService = require('../services/chatService');
const User = require('../models/User');
const GroupChat = require('../models/GroupChat');
const GroupMessage = require('../models/GroupMessage');

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

// @desc    Create a group chat
// @route   POST /api/chat/groups
// @access  Private
const createGroupChat = async (req, res) => {
  try {
    const { groupName, description, memberIds } = req.body;
    const createdBy = req.user._id;

    if (!groupName || !memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Group name and member IDs are required'
      });
    }

    // Add creator to members list
    const allMemberIds = [...new Set([...memberIds, createdBy.toString()])];
    
    // Create group ID
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create members array
    const members = allMemberIds.map(userId => ({
      userId,
      role: userId === createdBy.toString() ? 'admin' : 'member'
    }));

    const groupChat = new GroupChat({
      groupId,
      groupName,
      description,
      createdBy,
      members
    });

    await groupChat.save();

    // Populate member details
    await groupChat.populate('members.userId', 'fullName email profilePicture');

    // Emit group creation event
    const io = req.app.get('io');
    if (io) {
      allMemberIds.forEach(userId => {
        io.to(`user-${userId}`).emit('groupCreated', {
          group: groupChat
        });
      });
    }

    res.status(201).json({
      success: true,
      data: groupChat
    });
  } catch (error) {
    console.error('Error creating group chat:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Send a group message
// @route   POST /api/chat/groups/:groupId/messages
// @access  Private
const sendGroupMessage = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { content, messageType = 'text' } = req.body;
    const senderId = req.user._id;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    // Check if user is member of the group
    const group = await GroupChat.findOne({
      groupId,
      'members.userId': senderId,
      isActive: true
    });

    if (!group) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }

    // Create group message
    const groupMessage = new GroupMessage({
      groupId,
      senderId,
      content,
      messageType
    });

    await groupMessage.save();
    await groupMessage.populate('senderId', 'fullName email profilePicture');

    // Update group's last message
    await GroupChat.findOneAndUpdate(
      { groupId },
      {
        lastMessage: content,
        lastMessageTime: new Date(),
        lastMessageSender: senderId
      }
    );

    // Emit group message via Socket.IO
    const io = req.app.get('io');
    if (io) {
      group.members.forEach(member => {
        if (member.userId.toString() !== senderId.toString()) {
          io.to(`user-${member.userId}`).emit('newGroupMessage', {
            _id: groupMessage._id,
            groupId: groupMessage.groupId,
            senderId: groupMessage.senderId,
            content: groupMessage.content,
            messageType: groupMessage.messageType,
            timestamp: groupMessage.timestamp
          });

          // Send notification
          io.to(`user-${member.userId}`).emit('groupMessageNotification', {
            groupId: groupMessage.groupId,
            groupName: group.groupName,
            senderId: groupMessage.senderId,
            senderName: groupMessage.senderId.fullName,
            content: groupMessage.content,
            timestamp: groupMessage.timestamp
          });
        }
      });
    }

    res.status(201).json({
      success: true,
      data: groupMessage
    });
  } catch (error) {
    console.error('Error sending group message:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get group messages
// @route   GET /api/chat/groups/:groupId/messages
// @access  Private
const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { page = 1, limit = 50 } = req.query;

    // Check if user is member of the group
    const group = await GroupChat.findOne({
      groupId,
      'members.userId': userId,
      isActive: true
    });

    if (!group) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }

    // Get messages
    const messages = await GroupMessage.find({ groupId })
      .sort({ timestamp: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('senderId', 'fullName email profilePicture')
      .populate('readBy.userId', 'fullName');

    // Mark messages as read by current user
    const unreadMessages = messages.filter(msg => 
      !msg.readBy.some(read => read.userId._id.toString() === userId.toString())
    );

    if (unreadMessages.length > 0) {
      await GroupMessage.updateMany(
        { _id: { $in: unreadMessages.map(msg => msg._id) } },
        { $addToSet: { readBy: { userId, readAt: new Date() } } }
      );
    }

    res.status(200).json({
      success: true,
      data: messages.reverse(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting group messages:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get user's group chats
// @route   GET /api/chat/groups
// @access  Private
const getUserGroupChats = async (req, res) => {
  try {
    const userId = req.user._id;

    const groupChats = await GroupChat.find({
      'members.userId': userId,
      isActive: true
    })
    .populate('members.userId', 'fullName email profilePicture')
    .populate('lastMessageSender', 'fullName')
    .populate('createdBy', 'fullName')
    .sort({ lastMessageTime: -1 });

    res.status(200).json({
      success: true,
      data: groupChats
    });
  } catch (error) {
    console.error('Error getting user group chats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Add members to group
// @route   POST /api/chat/groups/:groupId/members
// @access  Private
const addGroupMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberIds } = req.body;
    const userId = req.user._id;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Member IDs are required'
      });
    }

    // Check if user is admin of the group
    const group = await GroupChat.findOne({
      groupId,
      'members.userId': userId,
      'members.role': 'admin',
      isActive: true
    });

    if (!group) {
      return res.status(403).json({
        success: false,
        message: 'Only group admins can add members'
      });
    }

    // Add new members
    const newMembers = memberIds.map(memberId => ({
      userId: memberId,
      role: 'member'
    }));

    await GroupChat.findOneAndUpdate(
      { groupId },
      { $addToSet: { members: { $each: newMembers } } }
    );

    // Emit member added event
    const io = req.app.get('io');
    if (io) {
      memberIds.forEach(memberId => {
        io.to(`user-${memberId}`).emit('addedToGroup', {
          groupId,
          groupName: group.groupName
        });
      });
    }

    res.status(200).json({
      success: true,
      message: 'Members added successfully'
    });
  } catch (error) {
    console.error('Error adding group members:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Remove member from group
// @route   DELETE /api/chat/groups/:groupId/members/:memberId
// @access  Private
const removeGroupMember = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user._id;

    // Check if user is admin of the group
    const group = await GroupChat.findOne({
      groupId,
      'members.userId': userId,
      'members.role': 'admin',
      isActive: true
    });

    if (!group) {
      return res.status(403).json({
        success: false,
        message: 'Only group admins can remove members'
      });
    }

    // Remove member
    await GroupChat.findOneAndUpdate(
      { groupId },
      { $pull: { members: { userId: memberId } } }
    );

    // Emit member removed event
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${memberId}`).emit('removedFromGroup', {
        groupId,
        groupName: group.groupName
      });
    }

    res.status(200).json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    console.error('Error removing group member:', error);
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

// @desc    Get all users for chat
// @route   GET /api/chat/users
// @access  Private
const getAllUsersForChat = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    
    // Get all users except current user, including customers
    const users = await User.find({ 
      _id: { $ne: currentUserId } 
    }).select('fullName email role chatStatus lastSeen profilePicture');

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
}; 