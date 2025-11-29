const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const fileStorage = require('../services/fileStorageService');
const {
  getEmployees,
  getEmployee,
  getEmployeeByUserId,
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
const { fixITInterns } = require('../controllers/fixEmployees');

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
    params: req.params,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length']
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

// Fix IT Interns employmentType
router.route('/fix-it-interns')
  .post(protect, fixITInterns);

// Employee routes - accessible to all authenticated users
router.route('/')
  .get(protect, getEmployees)
  .post(protect, uploadEmployeeFiles, createEmployee);

router.route('/:id')
  .get(protect, getEmployee)
  .put(protect, uploadEmployeeFiles, updateEmployee)
  .delete(protect, deleteEmployee);

// Get employee by user ID
router.route('/user/:userId')
  .get(protect, getEmployeeByUserId);

// Document routes
router.route('/:id/documents')
  .post(protect, uploadEmployeeFiles, uploadDocuments)
  .get(protect, getDocuments);

// Serve a single document by filename (local fallback)
router.get('/documents/:filename', protect, getDocument);

router.route('/:id/documents/:documentType')
  .delete(protect, deleteDocument);

module.exports = router; 