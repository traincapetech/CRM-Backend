const mongoose = require('mongoose');

const testAssignmentSchema = new mongoose.Schema({
  test: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedToUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  assignedToRoles: [{
    type: String,
    trim: true
  }],
  assignedToGroups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestUserGroup'
  }],
  startAt: {
    type: Date,
    default: null
  },
  endAt: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

testAssignmentSchema.index({ test: 1, createdAt: -1 });
testAssignmentSchema.index({ assignedToUsers: 1 });
testAssignmentSchema.index({ assignedToRoles: 1 });
testAssignmentSchema.index({ assignedToGroups: 1 });

module.exports = mongoose.model('TestAssignment', testAssignmentSchema);
