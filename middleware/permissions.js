const { getUserPermissions } = require('../utils/rbac');

const requirePermissions = (...requiredPermissions) => {
  return async (req, res, next) => {
    try {
      const { permissions } = await getUserPermissions(req.user);

      const hasPermission = requiredPermissions.some((permission) =>
        permissions.includes(permission)
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to access this resource'
        });
      }

      req.userPermissions = permissions;
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to verify permissions'
      });
    }
  };
};

module.exports = {
  requirePermissions
};
