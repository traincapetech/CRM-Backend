const ErrorResponse = require("../utils/errorResponse");
const Course = require("../models/Course");

// @desc    Get all courses
// @route   GET /api/courses
// @access  Private (Admin, Manager, Sales Person)
exports.getCourses = async (req, res, next) => {
  try {
    const courses = await Course.find().populate('createdBy updatedBy', 'fullName email');

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single course
// @route   GET /api/courses/:id
// @access  Private (Admin, Manager, Sales Person)
exports.getCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('createdBy updatedBy', 'fullName email');

    if (!course) {
      return next(new ErrorResponse(`Course not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: course,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new course
// @route   POST /api/courses
// @access  Private (Admin, Manager)
exports.createCourse = async (req, res, next) => {
  try {
    // Add user to req.body
    req.body.createdBy = req.user._id;

    // Check for existing course
    const existingCourse = await Course.findOne({ name: req.body.name });
    if (existingCourse) {
       return next(new ErrorResponse("Course with this name already exists", 400));
    }

    const course = await Course.create(req.body);

    res.status(201).json({
      success: true,
      data: course,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update course
// @route   PUT /api/courses/:id
// @access  Private (Admin, Manager)
exports.updateCourse = async (req, res, next) => {
  try {
    let course = await Course.findById(req.params.id);

    if (!course) {
      return next(new ErrorResponse(`Course not found with id of ${req.params.id}`, 404));
    }

    // Add updatedBy to req.body
    req.body.updatedBy = req.user._id;

    course = await Course.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: course,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete course
// @route   DELETE /api/courses/:id
// @access  Private (Admin, Manager)
exports.deleteCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return next(new ErrorResponse(`Course not found with id of ${req.params.id}`, 404));
    }

    await Course.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
};
