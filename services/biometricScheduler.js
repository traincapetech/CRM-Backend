const BiometricSettings = require('../models/BiometricSettings');
const { runBiometricPullSync } = require('./biometricSyncService');

let biometricInterval = null;

const startBiometricScheduler = async () => {
  await refreshBiometricScheduler();
  
  // Run initial sync if enabled (after a short delay to let server fully start)
  const settings = await BiometricSettings.findOne();
  if (settings && settings.enabled && settings.apiBaseUrl) {
    setTimeout(() => {
      console.log('Running initial biometric pull sync...');
      runBiometricPullSync().catch((error) => {
        console.error('Initial biometric pull sync failed:', error.message);
      });
    }, 5000); // Wait 5 seconds after server start
  }
};

const refreshBiometricScheduler = async () => {
  if (biometricInterval) {
    clearInterval(biometricInterval);
    biometricInterval = null;
  }

  const settings = await BiometricSettings.findOne();
  if (!settings || !settings.enabled) {
    return;
  }

  const intervalMinutes = settings?.syncIntervalMinutes || 60;
  const intervalMs = Math.max(intervalMinutes, 1) * 60 * 1000;

  biometricInterval = setInterval(() => {
    runBiometricPullSync().catch((error) => {
      // Only log errors, don't crash - webhook will still work
      if (error.message.includes('ENOTFOUND') || error.message.includes('404')) {
        console.warn('⚠️ Biometric pull sync skipped (API unavailable). Webhook will still work.');
      } else {
        console.error('Biometric pull sync failed:', error.message);
      }
    });
  }, intervalMs);
};

module.exports = {
  startBiometricScheduler,
  refreshBiometricScheduler
};
