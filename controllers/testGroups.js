const TestUserGroup = require('../models/TestUserGroup');

// @desc    List groups
// @route   GET /api/test-groups
// @access  Permission: test.manage_groups
exports.getGroups = async (req, res) => {
  const groups = await TestUserGroup.find({}).sort({ name: 1 }).populate('members', 'fullName email role roles');
  res.status(200).json({ success: true, data: groups });
};

// @desc    Create group
// @route   POST /api/test-groups
// @access  Permission: test.manage_groups
exports.createGroup = async (req, res) => {
  const { name, description, members } = req.body;
  const group = await TestUserGroup.create({
    name,
    description,
    members: Array.isArray(members) ? members : [],
    createdBy: req.user._id
  });
  res.status(201).json({ success: true, data: group });
};

// @desc    Update group
// @route   PUT /api/test-groups/:id
// @access  Permission: test.manage_groups
exports.updateGroup = async (req, res) => {
  const group = await TestUserGroup.findById(req.params.id);
  if (!group) {
    return res.status(404).json({ success: false, message: 'Group not found' });
  }

  const { name, description, members, isActive } = req.body;
  if (name) group.name = name;
  if (typeof description === 'string') group.description = description;
  if (Array.isArray(members)) group.members = members;
  if (typeof isActive === 'boolean') group.isActive = isActive;

  await group.save();
  res.status(200).json({ success: true, data: group });
};

// @desc    Delete group
// @route   DELETE /api/test-groups/:id
// @access  Permission: test.manage_groups
exports.deleteGroup = async (req, res) => {
  const group = await TestUserGroup.findById(req.params.id);
  if (!group) {
    return res.status(404).json({ success: false, message: 'Group not found' });
  }
  await group.deleteOne();
  res.status(200).json({ success: true, data: {} });
};
