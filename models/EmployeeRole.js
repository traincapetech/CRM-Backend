const mongoose = require('mongoose');

const employeeRoleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a role name'],
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
employeeRoleSchema.virtual('employeeCount', {
  ref: 'Employee',
  localField: '_id',
  foreignField: 'role',
  count: true
});

module.exports = mongoose.model('EmployeeRole', employeeRoleSchema); 