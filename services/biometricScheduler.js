const BiometricSettings = require('../models/BiometricSettings');
const { runBiometricPullSync } = require('./biometricSyncService');

let biometricInterval = null;

const startBiometricScheduler = async () => {
  await refreshBiometricScheduler();
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
      console.error('Biometric pull sync failed:', error.message);
    });
  }, intervalMs);
};

module.exports = {
  startBiometricScheduler,
  refreshBiometricScheduler
};
