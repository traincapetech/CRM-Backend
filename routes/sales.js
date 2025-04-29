const express = require('express');
const router = express.Router();
const {
  getSales,
  getSale,
  createSale,
  updateSale,
  deleteSale,
  updateToken,
  updatePending
} = require('../controllers/sales');

const { protect, authorize } = require('../middleware/auth');

// All routes below this line require authentication
router.use(protect);

// Routes specific to roles
router.route('/')
  .get(authorize('Sales Person', 'Manager', 'Admin'), getSales)
  .post(authorize('Sales Person', 'Manager', 'Admin'), createSale);

router.route('/:id')
  .get(authorize('Sales Person', 'Manager', 'Admin'), getSale)
  .put(authorize('Sales Person', 'Manager', 'Admin'), updateSale)
  .delete(authorize('Manager', 'Admin'), deleteSale);

// Routes for token and pending amount updates
router.route('/:id/token')
  .put(authorize('Sales Person', 'Manager', 'Admin'), updateToken);

router.route('/:id/pending')
  .put(authorize('Sales Person', 'Manager', 'Admin'), updatePending);

module.exports = router; 