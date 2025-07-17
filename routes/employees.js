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
  uploadEmployeeFiles,
  getDocument
} = require('../controllers/employees');

// Employee routes
router.get('/', protect, getEmployees);
router.get('/:id', protect, getEmployee);
router.post('/', protect, uploadEmployeeFiles, createEmployee);
router.put('/:id', protect, uploadEmployeeFiles, updateEmployee);
router.delete('/:id', protect, deleteEmployee);

// Department and Role routes
router.get('/departments', protect, getDepartments);
router.get('/roles', protect, getRoles);

// Document routes
router.get('/documents/:filename', protect, getDocument);

module.exports = router; 