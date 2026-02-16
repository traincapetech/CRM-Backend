const express = require('express');
const router = express.Router();
const controller = require('../controllers/department');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.get('/', protect, controller.getAllDepartments);
router.get('/me', protect, controller.getUserDepartment);
router.get('/:id', protect, controller.getDepartmentById);
router.get('/:id/members', protect, controller.getDepartmentMembers);

module.exports = router;
