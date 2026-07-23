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
  
  const permissions = new Set();
  
  try {
    const roles = await AccessRole.find({
      name: { $in: roleNames },
      isActive: true
    }).select('permissions');

    roles.forEach((role) => {
      (role.permissions || []).forEach((permission) => permissions.add(permission));
    });
  } catch (error) {
    console.error('Error fetching permissions for roles:', error);
    // Continue with empty set or default permissions instead of crashing
  }

  return permissions;
};

const getUserPermissions = async (user) => {
  const roleNames = getUserRoleNames(user);
  const permissionsSet = await getPermissionsForRoles(roleNames);

  // Industry Standard Role-Based Default Assessment Permissions:
  roleNames.forEach((role) => {
    // 1. Everyone except Customer can take assigned tests & view own attempt results
    if (role !== "Customer") {
      permissionsSet.add("test.take");
    }

    // 2. Admin & HR have full enterprise testing authority
    if (["Admin", "HR"].includes(role)) {
      permissionsSet.add("test.create");
      permissionsSet.add("test.assign");
      permissionsSet.add("test.evaluate");
      permissionsSet.add("test.report");
      permissionsSet.add("test.manage_roles");
      permissionsSet.add("test.manage_groups");
    }

    // 3. Department Managers & IT Managers can create, assign, evaluate, and view reports
    if (["Manager", "IT Manager"].includes(role)) {
      permissionsSet.add("test.create");
      permissionsSet.add("test.assign");
      permissionsSet.add("test.evaluate");
      permissionsSet.add("test.report");
    }
  });

  // Security Gate: Non-managerial operational staff (Sales, Lead Persons, Employees, Interns)
  // must NOT have test management or creation permissions.
  const isSuperUser = roleNames.some((r) => ["Admin", "HR", "Manager", "IT Manager"].includes(r));
  if (!isSuperUser) {
    permissionsSet.delete("test.create");
    permissionsSet.delete("test.assign");
    permissionsSet.delete("test.evaluate");
    permissionsSet.delete("test.report");
    permissionsSet.delete("test.manage_roles");
    permissionsSet.delete("test.manage_groups");
  }

  return {
    roleNames,
    permissions: Array.from(permissionsSet),
  };
};

module.exports = {
  getUserRoleNames,
  getPermissionsForRoles,
  getUserPermissions
};
