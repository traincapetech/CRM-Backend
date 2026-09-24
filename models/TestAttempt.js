const mongoose = require('mongoose');

const attemptAnswerSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestQuestion',
    required: true
  },
  type: {
    type: String,
    enum: ['MCQ', 'DESCRIPTIVE'],
    required: true
  },
  selectedOptionIndex: {
    type: Number,
    default: null
  },
  answerText: {
    type: String,
    default: ''
  },
  isCorrect: {
    type: Boolean,
    default: null
  },
  marksAwarded: {
    type: Number,
    default: 0
  },
  feedback: {
    type: String,
    default: ''
  }
}, { _id: false });

const attemptViolationSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  ipAddress: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  },
  details: {
    type: String,
    default: ''
  }
}, { _id: false });

const attemptQuestionSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestQuestion',
    required: true
  },
  type: {
    type: String,
    enum: ['MCQ', 'DESCRIPTIVE'],
    required: true
  },
  text: {
    type: String,
    required: true
  },
  options: [{
    text: { type: String, default: '' }
  }],
  marks: {
    type: Number,
    default: 1
  },
  correctOptionIndex: {
    type: Number,
    default: null
  }
}, { _id: false });

const testAttemptSchema = new mongoose.Schema({
  test: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true
  },
  assignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestAssignment',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  attemptToken: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['in_progress', 'submitted', 'auto_submitted'],
    default: 'in_progress'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  submittedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true
  },
  questionSnapshots: [attemptQuestionSchema],
  answers: [attemptAnswerSchema],
  score: {
    type: Number,
    default: 0
  },
  maxScore: {
    type: Number,
    default: 0
  },
  violations: [attemptViolationSchema],
  evaluatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  evaluationNotes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

testAttemptSchema.index({ test: 1, user: 1 });
testAttemptSchema.index({ user: 1, status: 1 });
testAttemptSchema.index({ assignment: 1 });

module.exports = mongoose.model('TestAttempt', testAttemptSchema);
