const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true
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