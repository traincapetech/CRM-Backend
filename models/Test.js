const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  durationMinutes: {
    type: Number,
    required: true,
    min: 1
  },
  scheduleStart: {
    type: Date,
    default: null
  },
  scheduleEnd: {
    type: Date,
    default: null
  },
  shuffleQuestions: {
    type: Boolean,
    default: true
  },
  shuffleOptions: {
    type: Boolean,
    default: true
  },
  violationThreshold: {
    type: Number,
    default: 3,
    min: 0
  },
  passingScore: {
    type: Number,
    default: 0,
    min: 0
  },
  questions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestQuestion'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

testSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('Test', testSchema);
