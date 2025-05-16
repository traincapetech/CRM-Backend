const express = require('express');
const router = express.Router();
const {
  getLeads,
  getLead,
  createLead,
  updateLead,
  deleteLead,
  updateFeedback,
  getAssignedLeads,
  importLeads,
  getAllCustomers,
  getRepeatCustomers
} = require('../controllers/leads');

const { protect, authorize } = require('../middleware/auth');

// All routes below this line require authentication
router.use(protect);

// Routes specific to roles
router.route('/')
  .get(authorize('Lead Person', 'Sales Person', 'Manager', 'Admin'), getLeads)
  .post(authorize('Lead Person', 'Sales Person', 'Manager', 'Admin'), createLead);

// Import route (Admin only)
router.post('/import', authorize('Admin', 'Manager'), importLeads);

// Repeat customers route (Admin/Manager only)
router.get('/repeat-customers', authorize('Admin', 'Manager'), getRepeatCustomers);

// The '/assigned' route must come BEFORE the '/:id' route
router.get('/assigned', authorize('Sales Person'), getAssignedLeads);
router.get('/customers', authorize('Sales Person'), getAllCustomers);

router.route('/:id')
  .get(authorize('Lead Person','Sales Person', 'Manager', 'Admin'), getLead)
  .put(authorize('Lead Person', 'Manager', 'Admin', 'Sales Person'), updateLead)
  .delete(authorize('Sales Person', 'Manager', 'Admin'), deleteLead);

router.put('/:id/feedback', authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), updateFeedback);

module.exports = router; 