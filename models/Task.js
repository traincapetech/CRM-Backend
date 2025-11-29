const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Please add a description']
  },
  assignedTo: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  assignedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  department: {
    type: String,
    required: true,
    enum: ['IT', 'Sales', 'HR', 'Admin']
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Partially Completed', 'Employee Completed', 'Manager Confirmed', 'Not Completed'],
    default: 'Pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  confirmedAt: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Task', TaskSchema); 