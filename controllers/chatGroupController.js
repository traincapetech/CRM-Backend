const ChatService = require("../services/chatService");

// @desc    Create a new group
// @route   POST /api/chat/groups
// @access  Private
const createGroup = async (req, res) => {
  try {
    const group = await ChatService.createGroup(req.body, req.user._id);
    res.status(201).json({
      success: true,
      data: group,
    });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get user's groups
// @route   GET /api/chat/groups
// @access  Private
const getUserGroups = async (req, res) => {
  try {
    const groups = await ChatService.getUserGroups(req.user._id);
    res.status(200).json({
      success: true,
      data: groups,
    });
  } catch (error) {
    console.error("Error fetching user groups:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get group messages
// @route   GET /api/chat/groups/:groupId/messages
// @access  Private
const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page, limit } = req.query;
    const messages = await ChatService.getGroupMessages(groupId, page, limit);
    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error("Error fetching group messages:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Add member to group
// @route   POST /api/chat/groups/:groupId/members
// @access  Private
const addGroupMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    const group = await ChatService.addGroupMember(groupId, userId, req.user._id);
    res.status(200).json({
      success: true,
      data: group,
    });
  } catch (error) {
    console.error("Error adding group member:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Remove member from group / Leave group
// @route   DELETE /api/chat/groups/:groupId/members/:userId
// @access  Private
const removeGroupMember = async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    await ChatService.removeGroupMember(groupId, userId, req.user._id);
    res.status(200).json({
      success: true,
      message: "Member removed successfully",
    });
  } catch (error) {
    console.error("Error removing group member:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createGroup,
  getUserGroups,
  getGroupMessages,
  addGroupMember,
  removeGroupMember,
};
