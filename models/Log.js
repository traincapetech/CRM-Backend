const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'LOGIN',
      'LOGOUT',
      'LEAD_CREATE',
      'LEAD_UPDATE',
      'LEAD_DELETE',
      'LEAD_ASSIGN',
      'SALE_CREATE',
      'SALE_UPDATE',
      'SALE_DELETE',
      'USER_CREATE',
      'USER_UPDATE',
      'USER_DELETE',
      'EMPLOYEE_CREATE',
      'EMPLOYEE_UPDATE',
      'EMPLOYEE_DELETE',
      'ATTENDANCE_MARK',
      'LEAVE_REQUEST',
      'LEAVE_UPDATE',
      'PAYROLL_UPDATE',
      'SETTINGS_UPDATE'
    ]
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  ipAddress: String,
  userAgent: String,
  affectedResource: {
    type: String,
    required: true
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  previousState: mongoose.Schema.Types.Mixed,
  newState: mongoose.Schema.Types.Mixed,
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILURE', 'WARNING'],
    default: 'SUCCESS'
  },
  additionalInfo: mongoose.Schema.Types.Mixed
});

// Add indexes for better query performance
logSchema.index({ timestamp: -1 });
logSchema.index({ action: 1 });
logSchema.index({ performedBy: 1 });
logSchema.index({ affectedResource: 1 });
logSchema.index({ status: 1 });

const Log = mongoose.model('Log', logSchema);

module.exports = Log; 