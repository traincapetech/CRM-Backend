const BiometricSettings = require('../models/BiometricSettings');
const { refreshBiometricScheduler } = require('../services/biometricScheduler');
const { syncAttendanceLogs, runBiometricPullSync, fetchVendorLogs } = require('../services/biometricSyncService');

const ensureAdminAccess = (req, res) => {
  if (!['Admin', 'HR', 'Manager'].includes(req.user.role)) {
    res.status(403).json({
      success: false,
      message: 'Not authorized'
    });
    return false;
  }
  return true;
};

const getMaskedSettings = (settings) => {
  return {
    enabled: settings.enabled,
    vendorName: settings.vendorName,
    apiBaseUrl: settings.apiBaseUrl,
    authType: settings.authType,
    syncIntervalMinutes: settings.syncIntervalMinutes,
    lastSyncAt: settings.lastSyncAt,
    hasApiKey: !!settings.apiKey,
    maskedApiKey: settings.apiKey ? '********' : '',
    webhookSecretConfigured: !!settings.webhookSecret
  };
};

const validateAuthToken = (settings, req) => {
  if (!settings.apiKey) {
    return true;
  }

  if (settings.authType === 'BEARER') {
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '')
      : null;
    return bearerToken === settings.apiKey;
  }

  const headerToken = req.headers['x-api-key'] || req.headers['x-biometric-token'];
  return headerToken === settings.apiKey;
};

// @desc    Receive biometric attendance logs (skeleton)
// @route   POST /api/biometric/webhook
// @access  Public (token-protected if configured)
exports.webhook = async (req, res) => {
  let settings = await BiometricSettings.findOne();
  if (!settings) {
    settings = await BiometricSettings.create({});
  }

  if (!settings.enabled) {
    return res.status(200).json({
      success: true,
      skipped: true,
      message: 'Biometric integration disabled'
    });
  }

  if (!validateAuthToken(settings, req)) {
    return res.status(401).json({
      success: false,
      message: 'Invalid biometric token'
    });
  }

  const providedWebhookSecret = req.headers['x-webhook-secret'];
  if (settings.webhookSecret && settings.webhookSecret !== providedWebhookSecret) {
    return res.status(401).json({
      success: false,
      message: 'Invalid webhook secret'
    });
  }

  console.log('Biometric webhook payload received:', req.body);

  try {
    const result = await syncAttendanceLogs(req.body);
    settings.lastSyncAt = new Date();
    await settings.save();

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Webhook processed'
    });
  } catch (error) {
    console.error('Biometric webhook processing failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Manual sync trigger (skeleton)
// @route   POST /api/biometric/sync
// @access  Private (Admin/HR/Manager)
exports.sync = async (req, res) => {
  if (!ensureAdminAccess(req, res)) return;

  try {
    console.log('Biometric manual sync requested by:', req.user.id);
    const result = await runBiometricPullSync();
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Sync completed'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Sync failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Test biometric connection (mock)
// @route   POST /api/biometric/test-connection
// @access  Private (Admin/HR/Manager)
exports.testConnection = async (req, res) => {
  if (!ensureAdminAccess(req, res)) return;

  try {
    const settings = await BiometricSettings.findOne();
    if (!settings?.apiBaseUrl) {
      return res.status(400).json({
        success: false,
        message: 'API Base URL is required for test connection'
      });
    }
    await fetchVendorLogs(settings);
    return res.status(200).json({
      success: true,
      message: 'Test connection successful'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Test connection failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get biometric settings
// @route   GET /api/biometric/settings
// @access  Private (Admin/HR/Manager)
exports.getBiometricSettings = async (req, res) => {
  if (!ensureAdminAccess(req, res)) return;

  let settings = await BiometricSettings.findOne();
  if (!settings) {
    settings = await BiometricSettings.create({});
  }

  return res.status(200).json({
    success: true,
    data: getMaskedSettings(settings)
  });
};

// @desc    Update biometric settings
// @route   PUT /api/biometric/settings
// @access  Private (Admin/HR/Manager)
exports.updateBiometricSettings = async (req, res) => {
  if (!ensureAdminAccess(req, res)) return;

  const {
    enabled,
    vendorName,
    apiBaseUrl,
    apiKey,
    authType,
    webhookSecret,
    syncIntervalMinutes
  } = req.body;

  let settings = await BiometricSettings.findOne();
  if (!settings) {
    settings = new BiometricSettings();
  }

  if (typeof enabled === 'boolean') settings.enabled = enabled;
  if (typeof vendorName === 'string') settings.vendorName = vendorName.trim();
  if (typeof apiBaseUrl === 'string') settings.apiBaseUrl = apiBaseUrl.trim();
  if (typeof authType === 'string') settings.authType = authType;
  if (typeof webhookSecret === 'string') settings.webhookSecret = webhookSecret.trim();
  if (typeof syncIntervalMinutes === 'number') settings.syncIntervalMinutes = syncIntervalMinutes;

  if (typeof apiKey === 'string' && apiKey.trim() && apiKey !== '********') {
    settings.apiKey = apiKey.trim();
  }

  await settings.save();
  await refreshBiometricScheduler();

  return res.status(200).json({
    success: true,
    data: getMaskedSettings(settings),
    message: 'Biometric settings updated'
  });
};
