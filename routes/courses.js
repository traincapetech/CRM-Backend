const express = require('express');
const {
  getCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse
} = require('../controllers/courses');

const Course = require('../models/Course');

const router = express.Router();

const { protect } = require('../middleware/auth');
const { getUserPermissions } = require('../utils/rbac');

// Helper to authorize by role OR permission
const authorizeRoleOrPermission = (allowedRoles = [], ...requiredPermissions) => {
  return async (req, res, next) => {
    const userRole = (req.user?.role || "").toLowerCase();
    const allowedLower = allowedRoles.map((r) => (r || "").toLowerCase());
    if (allowedLower.includes(userRole)) {
      return next();
    }

    try {
      const { permissions } = await getUserPermissions(req.user);
      const hasPermission = requiredPermissions.some((p) => permissions.includes(p));
      if (hasPermission) {
        return next();
      }
    } catch (err) {
      console.error("Error verifying course permissions:", err);
    }

    return res.status(403).json({
      success: false,
      message: `User role ${req.user?.role} is not authorized to perform this action`,
    });
  };
};

router.use(protect);

router
  .route('/')
  .get(
    authorizeRoleOrPermission(
      ['Admin', 'Manager', 'Sales Person', 'Lead Person', 'Sales Team Leader', 'Senior Sales Executive', 'Branch Partner'],
      'courses.view',
      'courses.read'
    ),
    getCourses
  )
  .post(
    authorizeRoleOrPermission(['Admin', 'Manager'], 'courses.create', 'courses.write'),
    createCourse
  );

router
  .route('/:id')
  .get(
    authorizeRoleOrPermission(
      ['Admin', 'Manager', 'Sales Person', 'Lead Person', 'Sales Team Leader', 'Senior Sales Executive', 'Branch Partner'],
      'courses.view',
      'courses.read'
    ),
    getCourse
  )
  .put(
    authorizeRoleOrPermission(['Admin', 'Manager'], 'courses.edit', 'courses.write'),
    updateCourse
  )
  .delete(
    authorizeRoleOrPermission(['Admin', 'Manager'], 'courses.delete'),
    deleteCourse
  );

module.exports = router;
