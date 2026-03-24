const AccessRole = require('../models/AccessRole');

const getUserRoleNames = (user) => {
  if (!user) return [];
  if (Array.isArray(user.roles) && user.roles.length > 0) {
    return user.roles.filter(Boolean);
  }
  if (user.role) {
    return [user.role];
  }
  return [];
};

const getPermissionsForRoles = async (roleNames) => {
  if (!roleNames || roleNames.length === 0) {
    return new Set();
  }
  const roles = await AccessRole.find({
    name: { $in: roleNames },
    isActive: true
  }).select('permissions');

  const permissions = new Set();
  roles.forEach((role) => {
    (role.permissions || []).forEach((permission) => permissions.add(permission));
  });

  return permissions;
};

const getUserPermissions = async (user) => {
  const roleNames = getUserRoleNames(user);
  const permissionsSet = await getPermissionsForRoles(roleNames);

  // Add default permissions for certain roles
  roleNames.forEach(role => {
    // Everyone except Customer should be able to take tests
    if (role !== 'Customer') {
      permissionsSet.add('test.take');
    }

    // Admins, Managers, and IT Managers should be able to evaluate tests
    if (['Admin', 'Manager', 'Lead Person', 'IT Manager'].includes(role)) {
      permissionsSet.add('test.evaluate');
      permissionsSet.add('test.report');
    }
  });

  return {
    roleNames,
    permissions: Array.from(permissionsSet)
  };
};

module.exports = {
  getUserRoleNames,
  getPermissionsForRoles,
  getUserPermissions
};
