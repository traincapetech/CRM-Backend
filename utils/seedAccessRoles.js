const AccessRole = require('../models/AccessRole');
const User = require('../models/User');

const TEST_PERMISSIONS = [
  'test.create',
  'test.assign',
  'test.take',
  'test.evaluate',
  'test.report',
  'test.manage_roles',
  'test.manage_groups'
];

const seedAccessRoles = async () => {
  const roleNames = new Set();

  const users = await User.find({}).select('role roles');
  users.forEach((user) => {
    if (user.role) roleNames.add(user.role);
    if (Array.isArray(user.roles)) {
      user.roles.forEach((role) => roleNames.add(role));
    }
  });

  for (const roleName of roleNames) {
    const existing = await AccessRole.findOne({ name: roleName });
    if (!existing) {
      await AccessRole.create({
        name: roleName,
        permissions: roleName === 'Admin' ? TEST_PERMISSIONS : [],
        isActive: true
      });
    }
  }
};

module.exports = { seedAccessRoles, TEST_PERMISSIONS };
