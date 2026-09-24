const mongoose = require('mongoose');

const biometricSettingsSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: false
  },
  vendorName: {
    type: String,
    trim: true,
    default: ''
  },
  apiBaseUrl: {
    type: String,
    trim: true,
    default: ''
  },
  apiKey: {
    type: String,
    default: ''
  },
  authType: {
    type: String,
    enum: ['HEADER', 'BEARER'],
    default: 'HEADER'
  },
  webhookSecret: {
    type: String,
    default: ''
  },
  syncIntervalMinutes: {
    type: Number,
    default: 60,
    min: 1,
    max: 1440
  },
  lastSyncAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('BiometricSettings', biometricSettingsSchema);
