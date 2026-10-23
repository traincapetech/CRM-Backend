const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const fileStorage = require('../services/fileStorageService');
const {
  getEmployees,
  getEmployee,
  getEmployeeByUserId,
  getTeamDirectory,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getDepartments,
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  uploadEmployeeFiles,
  uploadDocuments,
  getDocuments,
  getDocument,
  deleteDocument,
  updatePaymentDetails,
  verifyPayment,
  getEmploymentHistory,
  getEmployeeTimeline,
  getEmployeeAuditLogs,
  get360Profile,
  getNextOfficialId,
  getNextDocRef,
  commitDocRef,
  saveGeneratedLetterToVault,
  sendDocumentToEmployee
} = require('../controllers/employees');
const { fixITInterns } = require('../controllers/fixEmployees');

// Debug middleware
const debugMiddleware = (req, res, next) => {
  const hasToken = Boolean(
    (req.cookies && req.cookies.token) ||
    (req.headers.authorization && req.headers.authorization.startsWith("Bearer"))
  );

  console.log('Employee route accessed:', {
    method: req.method,
    path: req.path,
    authStatus: req.user
      ? `Authenticated (${req.user.role})`
      : hasToken
      ? 'Token present (verifying in auth middleware...)'
      : 'No token provided',
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
  .get(protect, getRoles)
  .post(protect, createRole);

router.route('/roles/:id')
  .put(protect, updateRole)
  .delete(protect, deleteRole);

// Fix IT Interns employmentType
router.route('/fix-it-interns')
  .post(protect, fixITInterns);

// Team directory - sanitized, accessible to all authenticated users (no PII)
router.route('/team-directory')
  .get(protect, getTeamDirectory);

// Employee history, timeline, audit logs, and 360 profile routes
router.get('/:id/employment-history', protect, getEmploymentHistory);
router.get('/:id/timeline', protect, getEmployeeTimeline);
router.get('/:id/audit-logs', protect, getEmployeeAuditLogs);
router.get('/:id/360', protect, get360Profile);

// Get next auto-incremented official ID
router.get('/next-official-id', protect, getNextOfficialId);

// Get next auto-incremented document reference number (07AAJ/HR/{TYPE}/{YEAR}/{SEQ})
router.get('/next-doc-ref', protect, getNextDocRef);

// Commit / advance document reference number
router.post('/commit-doc-ref', protect, commitDocRef);

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

// Save generated letter to employee vault
router.post('/:id/save-letter-vault', protect, saveGeneratedLetterToVault);

// Send document to employee via email
router.post('/:id/send-document', protect, sendDocumentToEmployee);

// Serve a single document by filename (local fallback)
router.get('/documents/:filename', protect, getDocument);

router.route('/:id/documents/:documentType')
  .delete(protect, deleteDocument);

// Payment details routes (Admin only)
router.route('/:id/payment-details')
  .post(protect, updatePaymentDetails);

router.route('/:id/verify-payment')
  .post(protect, verifyPayment);

module.exports = router; 