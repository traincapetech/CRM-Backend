const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  courseName: {
    type: String,
    trim: true
  },
  price: {
    type: Number,
    min: [0, 'Price cannot be negative']
  },
  examFee: {
    type: Number,
    min: [0, 'Exam fee cannot be negative']
  },
  package: {
    type: Number,
    default: 0,
    min: [0, 'Package price cannot be negative']
  },
  description: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
courseSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Course = mongoose.model('CoursePricing', courseSchema, 'course_pricings');

module.exports = Course;
