const express = require('express');
const {
  getCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse
} = require('../controllers/courses');

const Course = require('../models/Course');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router
  .route('/')
  .get(authorize('Admin', 'Manager', 'Sales Person'), getCourses)
  .post(authorize('Admin', 'Manager'), createCourse);

router
  .route('/:id')
  .get(authorize('Admin', 'Manager', 'Sales Person'), getCourse)
  .put(authorize('Admin', 'Manager'), updateCourse)
  .delete(authorize('Admin', 'Manager'), deleteCourse);

module.exports = router;
