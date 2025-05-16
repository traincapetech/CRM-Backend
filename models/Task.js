const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a task title'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  taskType: {
    type: String,
    enum: ['Exam', 'Follow-up', 'Other'],
    default: 'Exam'
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: [true, 'Please select a customer']
  },
  examDate: {
    type: Date,
    required: [true, 'Please specify the exam date and time']
  },
  remindersSent: [{
    sentAt: {
      type: Date,
      required: true
    },
    reminderType: {
      type: String,
      enum: ['30-minute-before', 'exam-time', '10-minute-after', 'other'],
      default: 'other'
    }
  }],
  completed: {
    type: Boolean,
    default: false
  },
  salesPerson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Please assign a sales person']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Task', TaskSchema); 