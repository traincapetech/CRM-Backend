const mongoose = require('mongoose');

const testQuestionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['MCQ', 'DESCRIPTIVE'],
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  options: [{
    text: { type: String, trim: true },
    isCorrect: { type: Boolean, default: false }
  }],
  marks: {
    type: Number,
    default: 1,
    min: 0
  },
  tags: [{
    type: String,
    trim: true
  }],
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Medium'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

testQuestionSchema.index({ type: 1, difficulty: 1 });
testQuestionSchema.index({ createdBy: 1 });

module.exports = mongoose.model('TestQuestion', testQuestionSchema);
