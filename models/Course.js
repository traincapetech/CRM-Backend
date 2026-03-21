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

const Course = mongoose.model('Course', courseSchema);

// Drop the unique index if it exists to allow duplicates as requested
Course.collection.dropIndex('courseName_1').catch(err => {
  // Silence error if index doesn't exist
  if (err.code !== 27) {
    console.warn('Note: Could not drop courseName index (might not be unique or already dropped):', err.message);
  }
});

module.exports = Course;
