const express = require('express');
const router = express.Router();
const { generateProjectDocumentation } = require('../controllers/documentation');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/documentation/project
// @desc    Generate project documentation PDF
// @access  Private (Admin/HR/Manager only)
router.get('/project', protect, authorize('Admin', 'HR', 'Manager'), generateProjectDocumentation);

module.exports = router; 