const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getDepartments,
  getRoles,
  uploadDocuments,
  getDocuments,
  deleteDocument
} = require('../controllers/employees');

// Debug middleware
const debugMiddleware = (req, res, next) => {
  console.log('Employee route accessed:', {
    method: req.method,
    path: req.path,
    user: req.user ? {
      id: req.user.id,
      role: req.user.role
    } : 'Not authenticated',
    query: req.query,
    params: req.params
  });
  
  next();
};

// Apply debug middleware to all routes
router.use(debugMiddleware);

// Get departments and roles - accessible to all authenticated users
router.route('/departments')
  .get(protect, getDepartments);

router.route('/roles')
  .get(protect, getRoles);

// Employee routes - accessible to all authenticated users
router.route('/')
  .get(protect, getEmployees)
  .post(protect, createEmployee);

router.route('/:id')
  .get(protect, getEmployee)
  .put(protect, updateEmployee)
  .delete(protect, deleteEmployee);

// Document routes
router.route('/:id/documents')
  .post(protect, uploadDocuments)
  .get(protect, getDocuments);

router.route('/:id/documents/:documentType')
  .delete(protect, deleteDocument);

module.exports = router; 