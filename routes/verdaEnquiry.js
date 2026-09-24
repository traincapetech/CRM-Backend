const express = require('express');
const router = express.Router();
const {
  getEnquiries,
  getEnquiry,
  createEnquiry,
  updateEnquiry,
  deleteEnquiry
} = require('../controllers/verdaEnquiry');

const { protect, authorize } = require('../middleware/auth');

// POST route is public for website submissions
router.post('/', createEnquiry);

// All other routes require authentication and specific roles
router.use(protect);

router.route('/')
  .get(authorize('Admin', 'Manager', 'Sales Person'), getEnquiries);

router.route('/:id')
  .get(authorize('Admin', 'Manager', 'Sales Person'), getEnquiry)
  .put(authorize('Admin', 'Manager', 'Sales Person'), updateEnquiry)
  .delete(authorize('Admin', 'Manager'), deleteEnquiry);

module.exports = router;
