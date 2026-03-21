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

// Log and clean up indexes to ensure duplicates are allowed
Course.collection.getIndexes()
  .then(indexes => {
    console.log('Course collection indexes:', indexes);
    // If courseName_1 exists and is unique, drop it
    if (indexes.courseName_1) {
      return Course.collection.dropIndex('courseName_1');
    }
  })
  .then(() => console.log('Unique index handling complete'))
  .catch(err => console.error('Error during index handling:', err.message));

module.exports = Course;
