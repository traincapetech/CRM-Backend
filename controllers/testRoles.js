const AccessRole = require('../models/AccessRole');
const { TEST_PERMISSIONS } = require('../utils/seedAccessRoles');

// @desc    List access roles
// @route   GET /api/test-roles
// @access  Permission: test.manage_roles
exports.getRoles = async (req, res) => {
  const roles = await AccessRole.find({}).sort({ name: 1 });
  res.status(200).json({ success: true, data: roles, permissions: TEST_PERMISSIONS });
};

// @desc    Create access role
// @route   POST /api/test-roles
// @access  Permission: test.manage_roles
exports.createRole = async (req, res) => {
  const { name, description, permissions } = req.body;
  const role = await AccessRole.create({
    name,
    description,
    permissions: Array.isArray(permissions) ? permissions : [],
    createdBy: req.user._id
  });
  res.status(201).json({ success: true, data: role });
};

// @desc    Update access role
// @route   PUT /api/test-roles/:id
// @access  Permission: test.manage_roles
exports.updateRole = async (req, res) => {
  const { name, description, permissions, isActive } = req.body;
  const role = await AccessRole.findById(req.params.id);

  if (!role) {
    return res.status(404).json({ success: false, message: 'Role not found' });
  }

  if (name) role.name = name;
  if (typeof description === 'string') role.description = description;
  if (Array.isArray(permissions)) role.permissions = permissions;
  if (typeof isActive === 'boolean') role.isActive = isActive;

  await role.save();
  res.status(200).json({ success: true, data: role });
};

// @desc    Delete access role
// @route   DELETE /api/test-roles/:id
// @access  Permission: test.manage_roles
exports.deleteRole = async (req, res) => {
  const role = await AccessRole.findById(req.params.id);
  if (!role) {
    return res.status(404).json({ success: false, message: 'Role not found' });
  }
  await role.deleteOne();
  res.status(200).json({ success: true, data: {} });
};
