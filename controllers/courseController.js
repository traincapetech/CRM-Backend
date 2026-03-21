const Course = require('../models/Course');

// @desc    Get all courses
// @route   GET /api/courses
// @access  Private
exports.getCourses = async (req, res) => {
  try {
    let query;

    // Copy req.query
    const reqQuery = { ...req.query };

    // Fields to exclude
    const removeFields = ['select', 'sort', 'page', 'limit', 'search'];

    // Loop over removeFields and delete them from reqQuery
    removeFields.forEach((param) => delete reqQuery[param]);

    // Create query string
    let queryStr = JSON.stringify(reqQuery);

    // Create operators ($gt, $gte, etc)
    queryStr = queryStr.replace(
      /\b(gt|gte|lt|lte|in)\b/g,
      (match) => `$${match}`
    );

    // Finding resource
    let mongoQuery = JSON.parse(queryStr);

    // Search by course name
    if (req.query.search) {
      mongoQuery.courseName = { $regex: req.query.search, $options: 'i' };
    }

    query = Course.find(mongoQuery);

    // Select Fields
    if (req.query.select) {
      const fields = req.query.select.split(',').join(' ');
      query = query.select(fields);
    }

    // Sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Course.countDocuments(mongoQuery);

    query = query.skip(startIndex).limit(limit);

    // Executing query
    const courses = await query;

    // Pagination result
    const pagination = {};

    if (endIndex < total) {
      pagination.next = {
        page: page + 1,
        limit,
      };
    }

    if (startIndex > 0) {
      pagination.prev = {
        page: page - 1,
        limit,
      };
    }

    res.status(200).json({
      success: true,
      count: courses.length,
      total,
      pagination,
      data: courses,
    });
  } catch (err) {
    console.error('Error fetching courses:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error',
    });
  }
};

// @desc    Get single course
// @route   GET /api/courses/:id
// @access  Private
exports.getCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    res.status(200).json({
      success: true,
      data: course,
    });
  } catch (err) {
    console.error('Error fetching course:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error',
    });
  }
};

// @desc    Create new course
// @route   POST /api/courses
// @access  Private (Admin, Manager)
exports.createCourse = async (req, res) => {
  try {
    console.log('Creating course with data:', req.body);
    // Check role
    if (!['Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create courses',
      });
    }

    const course = await Course.create(req.body);

    res.status(201).json({
      success: true,
      data: course,
    });
  } catch (err) {
    console.error('Error creating course:', err);
    // Provide specific validation error messages if available
    const message = err.name === 'ValidationError' 
      ? Object.values(err.errors).map(val => val.message).join(', ')
      : err.message;

    res.status(400).json({
      success: false,
      message: message || 'Failed to create course',
      error: err.name
    });
  }
};

// @desc    Update course
// @route   PUT /api/courses/:id
// @access  Private (Admin, Manager)
exports.updateCourse = async (req, res) => {
  try {
    console.log('Updating course with ID:', req.params.id, 'Data:', req.body);
    // Check role
    if (!['Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update courses',
      });
    }

    let course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    course = await Course.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: course,
    });
  } catch (err) {
    console.error('Error updating course:', err);
    const message = err.name === 'ValidationError' 
      ? Object.values(err.errors).map(val => val.message).join(', ')
      : err.message;

    res.status(400).json({
      success: false,
      message: message || 'Failed to update course',
      error: err.name
    });
  }
};

// @desc    Delete course
// @route   DELETE /api/courses/:id
// @access  Private (Admin, Manager)
exports.deleteCourse = async (req, res) => {
  try {
    // Check role
    if (!['Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete courses',
      });
    }

    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    await Course.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (err) {
    console.error('Error deleting course:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error',
    });
  }
};
