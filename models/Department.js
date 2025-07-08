const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a department name'],
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for employee count
departmentSchema.virtual('employeeCount', {
  ref: 'Employee',
  localField: '_id',
  foreignField: 'department',
  count: true
});

module.exports = mongoose.model('Department', departmentSchema); 