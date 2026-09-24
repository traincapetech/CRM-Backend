const express = require('express');
const router = express.Router();
const {
  getLeadPersonSales,
  getLeadPersonSale,
  createLeadPersonSale,
  updateLeadPersonSale,
  deleteLeadPersonSale
} = require('../controllers/leadPersonSales');

const { protect, authorize } = require('../middleware/auth');

// All routes below this line require authentication
router.use(protect);

// Routes specific to roles
router.route('/')
  .get(authorize('Lead Person', 'Manager', 'Admin'), getLeadPersonSales)
  .post(authorize('Lead Person', 'Manager', 'Admin'), createLeadPersonSale);

router.route('/:id')
  .get(authorize('Lead Person', 'Manager', 'Admin'), getLeadPersonSale)
  .put(authorize('Lead Person', 'Manager', 'Admin'), updateLeadPersonSale)
  .delete(authorize('Lead Person', 'Manager', 'Admin'), deleteLeadPersonSale);

module.exports = router; 