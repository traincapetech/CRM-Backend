const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse
} = require('../controllers/courseController');

// All routes are protected (must be logged in)
router.use(protect);

router.route('/')
  .get(getCourses)
  .post(createCourse);

router.route('/:id')
  .get(getCourse)
  .put(updateCourse)
  .delete(deleteCourse);

module.exports = router;
