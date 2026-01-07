/**
 * Email Template Routes
 */

const express = require('express');
const router = express.Router();
const {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplate,
  duplicateTemplate
} = require('../controllers/emailTemplates');
const { protect, authorize } = require('../middleware/auth');
const { cacheMiddleware, invalidateCache } = require('../middleware/cache');

// All routes require authentication
router.use(protect);

// Get all templates (with caching)
router.get('/', authorize('Admin', 'Manager'), cacheMiddleware(300), getTemplates);

// Get single template
router.get('/:id', authorize('Admin', 'Manager'), getTemplate);

// Create template
router.post('/', authorize('Admin', 'Manager'), invalidateCache, createTemplate);

// Update template
router.put('/:id', authorize('Admin', 'Manager'), invalidateCache, updateTemplate);

// Delete template
router.delete('/:id', authorize('Admin', 'Manager'), invalidateCache, deleteTemplate);

// Preview template
router.post('/:id/preview', authorize('Admin', 'Manager'), previewTemplate);

// Duplicate template
router.post('/:id/duplicate', authorize('Admin', 'Manager'), invalidateCache, duplicateTemplate);

module.exports = router;

