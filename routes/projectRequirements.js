const express = require('express');
const router = express.Router();
const {
  getRequirements,
  getRequirement,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  addComment,
  uploadAttachment,
  convertToLead,
  convertToClient,
  getDashboardStats,
  getAnalytics
} = require('../controllers/projectRequirements');

const { protect, authorize } = require('../middleware/auth');
const { uploadMiddleware } = require('../services/fileStorageService');

router.use(protect);

router.route('/stats')
  .get(authorize('Admin', 'Manager', 'Sales Person', 'Lead Person'), getDashboardStats);

router.route('/analytics')
  .get(authorize('Admin', 'Manager', 'Sales Person', 'Lead Person'), getAnalytics);

router.route('/')
  .get(authorize('Admin', 'Manager', 'Sales Person', 'Lead Person'), getRequirements)
  .post(authorize('Admin', 'Manager', 'Sales Person', 'Lead Person'), createRequirement);

router.route('/:id')
  .get(authorize('Admin', 'Manager', 'Sales Person', 'Lead Person'), getRequirement)
  .put(authorize('Admin', 'Manager', 'Sales Person', 'Lead Person'), updateRequirement)
  .delete(authorize('Admin', 'Manager'), deleteRequirement);

router.route('/:id/comments')
  .post(authorize('Admin', 'Manager', 'Sales Person', 'Lead Person'), addComment);

router.route('/:id/attachments')
  .post(authorize('Admin', 'Manager', 'Sales Person', 'Lead Person'), uploadMiddleware.single('file'), uploadAttachment);

router.route('/:id/convert-lead')
  .post(authorize('Admin', 'Manager', 'Sales Person', 'Lead Person'), convertToLead);

router.route('/:id/convert-client')
  .post(authorize('Admin', 'Manager', 'Sales Person', 'Lead Person'), convertToClient);

module.exports = router;
