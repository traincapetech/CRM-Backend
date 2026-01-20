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
  const permissions = await getPermissionsForRoles(roleNames);
  return {
    roleNames,
    permissions: Array.from(permissions)
  };
};

module.exports = {
  getUserRoleNames,
  getPermissionsForRoles,
  getUserPermissions
};
