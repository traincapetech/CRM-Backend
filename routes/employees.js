const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const fileStorage = require('../services/fileStorageService');
const {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getDepartments,
  getRoles,
  uploadEmployeeFiles,
  uploadDocuments,
  getDocuments,
  getDocument,
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
  .post(protect, uploadEmployeeFiles, createEmployee);

router.route('/:id')
  .get(protect, getEmployee)
  .put(protect, uploadEmployeeFiles, updateEmployee)
  .delete(protect, deleteEmployee);

// Document routes
router.route('/:id/documents')
  .post(protect, uploadEmployeeFiles, uploadDocuments)
  .get(protect, getDocuments);

// Serve a single document by filename (local fallback)
router.get('/documents/:filename', protect, getDocument);

router.route('/:id/documents/:documentType')
  .delete(protect, deleteDocument);

module.exports = router; 