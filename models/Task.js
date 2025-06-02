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
  course: {
    type: String,
    trim: true,
    required: function() {
      return this.taskType === 'Exam';
    }
  },
  location: {
    type: String,
    trim: true,
    default: 'Online'
  },
  examLink: {
    type: String,
    trim: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: function() {
      return !this.manualCustomer; // Required only if manualCustomer is not provided
    }
  },
  manualCustomer: {
    name: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email'
      ]
    },
    contactNumber: {
      type: String,
      trim: true
    },
    course: {
      type: String,
      trim: true
    }
  },
  examDate: {
    type: Date,
    required: [true, 'Please specify the exam date and time']
  },
  examDateTime: {
    type: Date,
    required: [true, 'Please specify the exam date and time']
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Please assign a user to this task']
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  remindersSent: [{
    sentAt: {
      type: Date,
      required: true
    },
    reminderType: {
      type: String,
      enum: ['30-minute-before', '10-minute-before', 'exam-time', '10-minute-after', 'other'],
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

// Pre-save middleware to sync examDate and examDateTime
TaskSchema.pre('save', function(next) {
  if (this.examDate && !this.examDateTime) {
    this.examDateTime = this.examDate;
  } else if (this.examDateTime && !this.examDate) {
    this.examDate = this.examDateTime;
  }
  next();
});

module.exports = mongoose.model('Task', TaskSchema); 