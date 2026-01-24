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

// @desc    Manual sync trigger (fetches all employees)
// @route   POST /api/biometric/sync
// @access  Private (Admin/HR/Manager)
exports.sync = async (req, res) => {
  if (!ensureAdminAccess(req, res)) return;

  try {
    const { forceFullSync = false, historicalSync = false, startDate = '2026-01-01' } = req.body;
    console.log('Biometric manual sync requested by:', req.user.id, {
      forceFullSync,
      historicalSync,
      startDate,
      timestamp: new Date().toISOString()
    });
    
    const options = {
      forceFullSync,
      historicalSync,
      startDate: historicalSync ? startDate : undefined,
      endDate: historicalSync ? new Date().toISOString().split('T')[0] : undefined
    };
    
    const result = await runBiometricPullSync(options);
    
    return res.status(200).json({
      success: true,
      data: result,
      message: result.skipped 
        ? `Sync skipped: ${result.reason}`
        : `Sync completed: ${result.processed || 0} logs processed, ${result.created || 0} created, ${result.updated || 0} updated`
    });
  } catch (error) {
    console.error('Biometric manual sync error:', error);
    return res.status(500).json({
      success: false,
      message: 'Sync failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Test biometric connection
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

    if (!settings.apiKey) {
      return res.status(400).json({
        success: false,
        message: 'API Key/Token is required for test connection'
      });
    }

    console.log('Testing biometric connection:', {
      url: settings.apiBaseUrl,
      authType: settings.authType,
      hasApiKey: !!settings.apiKey
    });

    // Try to fetch logs (just test the connection, don't process)
    const data = await fetchVendorLogs(settings, { limit: 1 }); // Only fetch 1 record for testing
    
    return res.status(200).json({
      success: true,
      message: 'Test connection successful',
      data: {
        recordsFound: Array.isArray(data) ? data.length : 
                     (data?.logs?.length || data?.data?.length || 0),
        dataType: Array.isArray(data) ? 'array' : typeof data
      }
    });
  } catch (error) {
    console.error('Test connection error:', error);
    
    let errorMessage = 'Test connection failed';
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      errorMessage = 'Cannot reach API server. Check if the API Base URL is correct.';
    } else if (error.response?.status === 401 || error.response?.status === 403) {
      errorMessage = 'Authentication failed. Check if API Key/Token is correct.';
    } else if (error.response?.status === 404) {
      errorMessage = 'API endpoint not found. Check if the API Base URL is correct.';
    } else if (error.response?.status) {
      errorMessage = `API returned error ${error.response.status}: ${error.response.statusText}`;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return res.status(500).json({
      success: false,
      message: errorMessage,
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
