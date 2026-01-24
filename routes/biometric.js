const express = require('express');
const { protect } = require('../middleware/auth');
const {
  webhook,
  sync,
  testConnection,
  getBiometricSettings,
  updateBiometricSettings
} = require('../controllers/biometric');

const router = express.Router();

// Webhook endpoint (public, token-validated if configured)
router.post('/webhook', webhook);
router.post('/sync', protect, sync);
router.post('/test-connection', protect, testConnection);
router.get('/settings', protect, getBiometricSettings);
router.put('/settings', protect, updateBiometricSettings);

module.exports = router;
