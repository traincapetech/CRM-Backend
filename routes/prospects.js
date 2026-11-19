const express = require('express');
const router = express.Router();
const {
  getProspects,
  getProspectById,
  createProspect,
  updateProspect,
  deleteProspect,
  convertToLead,
  getProspectStats,
  getDueFollowUps
} = require('../controllers/prospectController');
const { protect, authorize } = require('../middleware/auth');

// Apply authentication to all prospect routes
router.use(protect);

// GET /api/prospects/due-today - Get logged-in user's prospects scheduled for follow-up today
// Accessible to any authenticated user (strictly returns only their own assigned prospects)
router.get('/due-today', getDueFollowUps);

// Apply role-based authorization
router.use(authorize('Sales Person', 'Sales Team Leader', 'Team Leader', 'Senior Sales Executive', 'Sales Executive', 'Sales Manager', 'Manager', 'Admin', 'Branch Partner'));

// GET /api/prospects - Get all prospects with filtering
router.get('/', getProspects);

// GET /api/prospects/stats - Get prospect statistics
router.get('/stats', getProspectStats);

// GET /api/prospects/:id - Get single prospect
router.get('/:id', getProspectById);

// POST /api/prospects - Create new prospect
router.post('/', createProspect);

// PUT /api/prospects/:id - Update prospect
router.put('/:id', updateProspect);

// DELETE /api/prospects/:id - Delete prospect (Admin/Manager only)
router.delete('/:id', deleteProspect);

// POST /api/prospects/:id/convert - Convert prospect to lead
router.post('/:id/convert', convertToLead);

module.exports = router; 