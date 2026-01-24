const mongoose = require('mongoose');

const biometricLogSchema = new mongoose.Schema({
  biometricCode: {
    type: String,
    required: true,
    trim: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  eventTime: {
    type: Date,
    required: true
  },
  eventType: {
    type: String,
    enum: ['IN', 'OUT', 'PUNCH'],
    required: true
  },
  deviceSerial: {
    type: String,
    default: null
  },
  attendanceDate: {
    type: Date,
    required: true
  },
  vendorLogId: {
    type: String,
    default: null
  },
  rawPayload: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true
});

// Vendor unique log ID (if provided)
biometricLogSchema.index({ vendorLogId: 1 }, { unique: true, sparse: true });

// Fallback idempotency if vendorLogId is missing
biometricLogSchema.index(
  { biometricCode: 1, eventTime: 1, eventType: 1 },
  { unique: true }
);

module.exports = mongoose.model('BiometricLog', biometricLogSchema);
