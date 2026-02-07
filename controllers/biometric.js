const BiometricSettings = require("../models/BiometricSettings");
const Employee = require("../models/Employee");
const BiometricLog = require("../models/BiometricLog");
const Attendance = require("../models/Attendance");
const { refreshBiometricScheduler } = require("../services/biometricScheduler");
const {
  syncAttendanceLogs,
  runBiometricPullSync,
  fetchVendorLogs,
} = require("../services/biometricSyncService");

const ensureAdminAccess = (req, res) => {
  if (!["Admin", "HR", "Manager"].includes(req.user.role)) {
    res.status(403).json({
      success: false,
      message: "Not authorized to access biometric settings",
    });
    return false;
  }
  return true;
};

const getMaskedSettings = (settings) => {
  const masked = settings.toObject();
  if (masked.apiKey) {
    masked.maskedApiKey =
      masked.apiKey.length > 8
        ? `${masked.apiKey.substring(0, 4)}${"*".repeat(masked.apiKey.length - 8)}${masked.apiKey.substring(masked.apiKey.length - 4)}`
        : "********";
    masked.hasApiKey = true;
    delete masked.apiKey;
  } else {
    masked.hasApiKey = false;
    masked.maskedApiKey = "";
  }
  masked.webhookSecretConfigured = !!masked.webhookSecret;
  if (masked.webhookSecret) {
    masked.webhookSecret = "********";
  }
  return masked;
};

// @desc    Get biometric settings
// @route   GET /api/biometric/settings
// @access  Private (Admin/HR/Manager)
exports.getBiometricSettings = async (req, res) => {
  if (!ensureAdminAccess(req, res)) return;

  try {
    let settings = await BiometricSettings.findOne();
    if (!settings) {
      settings = await BiometricSettings.create({
        enabled: false,
        vendorName: "",
        apiBaseUrl: "",
        apiKey: "",
        authType: "HEADER",
        webhookSecret: "",
        syncIntervalMinutes: 60,
      });
    }

    return res.status(200).json({
      success: true,
      data: getMaskedSettings(settings),
    });
  } catch (error) {
    console.error("Error fetching biometric settings:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch biometric settings",
    });
  }
};

// @desc    Update biometric settings
// @route   PUT /api/biometric/settings
// @access  Private (Admin/HR/Manager)
exports.updateBiometricSettings = async (req, res) => {
  if (!ensureAdminAccess(req, res)) return;

  try {
    let settings = await BiometricSettings.findOne();
    if (!settings) {
      settings = new BiometricSettings();
    }

    const {
      enabled,
      vendorName,
      apiBaseUrl,
      apiKey,
      authType,
      webhookSecret,
      syncIntervalMinutes,
    } = req.body;

    if (typeof enabled === "boolean") settings.enabled = enabled;
    if (typeof vendorName === "string") settings.vendorName = vendorName.trim();
    if (typeof apiBaseUrl === "string") settings.apiBaseUrl = apiBaseUrl.trim();
    if (typeof authType === "string") settings.authType = authType;
    if (typeof webhookSecret === "string")
      settings.webhookSecret = webhookSecret.trim();
    if (typeof syncIntervalMinutes === "number")
      settings.syncIntervalMinutes = syncIntervalMinutes;

    if (typeof apiKey === "string" && apiKey.trim() && apiKey !== "********") {
      settings.apiKey = apiKey.trim();
    }

    await settings.save();
    await refreshBiometricScheduler();

    return res.status(200).json({
      success: true,
      data: getMaskedSettings(settings),
      message: "Biometric settings updated",
    });
  } catch (error) {
    console.error("Error updating biometric settings:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update biometric settings",
    });
  }
};

// @desc    Test connection to vendor API
// @route   POST /api/biometric/test-connection
// @access  Private (Admin/HR/Manager)
exports.testConnection = async (req, res) => {
  if (!ensureAdminAccess(req, res)) return;

  try {
    const settings = await BiometricSettings.findOne();
    if (!settings || !settings.enabled) {
      return res.status(400).json({
        success: false,
        message: "Biometric integration is not enabled",
      });
    }

    if (!settings.apiBaseUrl) {
      return res.status(400).json({
        success: false,
        message: "API Base URL is not configured",
      });
    }

    if (!settings.apiKey) {
      return res.status(400).json({
        success: false,
        message: "API Key is required for testing connection",
      });
    }

    try {
      const testPayload = await fetchVendorLogs(settings, { limit: 1 });
      return res.status(200).json({
        success: true,
        message: "Connection test successful",
        data: {
          receivedLogs: Array.isArray(testPayload) ? testPayload.length : 0,
        },
      });
    } catch (error) {
      console.error("Test connection error:", error);

      let errorMessage = "Connection test failed";
      if (error.code === "ENOTFOUND" || error.message.includes("getaddrinfo")) {
        errorMessage = "Cannot reach API server. Check API Base URL.";
      } else if (
        error.response?.status === 401 ||
        error.response?.status === 403
      ) {
        errorMessage = "Authentication failed. Check API Key.";
      } else if (error.response?.status === 404) {
        errorMessage = "API endpoint not found. Check API Base URL.";
      } else if (error.message) {
        errorMessage = `Connection failed: ${error.message}`;
      }

      return res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }
  } catch (error) {
    console.error("Test connection error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to test connection",
    });
  }
};

// @desc    Webhook endpoint for vendor to push attendance logs
// @route   POST /api/biometric/webhook
// @access  Public (token-validated if configured)
exports.webhook = async (req, res) => {
  // DEBUG: Log everything immediately
  console.log("🚨 WEBHOOK HIT DETECTED");
  console.log("Method:", req.method);
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));

  try {
    const settings = await BiometricSettings.findOne();
    if (!settings || !settings.enabled) {
      return res.status(200).json({
        success: false,
        message: "Biometric integration is disabled",
      });
    }

    // Validate webhook secret if configured
    if (settings.webhookSecret) {
      const providedSecret =
        req.headers["x-webhook-secret"] ||
        req.headers["authorization"]?.replace("Bearer ", "");
      if (providedSecret !== settings.webhookSecret) {
        console.warn("⚠️ Webhook secret mismatch");
        return res.status(401).json({
          success: false,
          message: "Invalid webhook secret",
        });
      }
    }

    console.log("📨 Biometric webhook received:", {
      headers: {
        authorization: req.headers.authorization ? "Present" : "Missing",
        "x-webhook-secret": req.headers["x-webhook-secret"]
          ? "Present"
          : "Missing",
        "content-type": req.headers["content-type"],
      },
      bodyKeys: req.body ? Object.keys(req.body) : "No body",
      bodyType: Array.isArray(req.body) ? "Array" : typeof req.body,
    });

    try {
      const result = await syncAttendanceLogs(req.body);
      settings.lastSyncAt = new Date();
      await settings.save();
      console.log("✅ Webhook processed successfully:", result);
      return res.status(200).json({
        success: true,
        data: result,
        message:
          result.unmatched > 0
            ? `Webhook processed. ${result.unmatched} logs unmatched (check employee biometricCode).`
            : "Webhook processed",
      });
    } catch (error) {
      console.error("❌ Biometric webhook processing failed:", error.message);
      console.error("Error stack:", error.stack);
      return res.status(500).json({
        success: false,
        message: "Failed to process webhook",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};

// @desc    Manual sync trigger (pull from vendor API)
// @route   POST /api/biometric/sync
// @access  Private (Admin/HR/Manager)
exports.sync = async (req, res) => {
  if (!ensureAdminAccess(req, res)) return;

  try {
    const { historicalSync, startDate, endDate } = req.body;
    const result = await runBiometricPullSync({
      historicalSync: historicalSync === true,
      startDate,
      endDate,
    });

    if (result.skipped) {
      return res.status(200).json({
        success: true,
        message: result.reason || "Sync skipped",
        data: result,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Sync completed",
      data: result,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return res.status(500).json({
      success: false,
      message: "Sync failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// @desc    Diagnostic endpoint to check employee biometric setup
// @route   GET /api/biometric/diagnose/:biometricCode
// @access  Private (Admin/HR/Manager)
exports.diagnose = async (req, res) => {
  if (!ensureAdminAccess(req, res)) return;

  try {
    const { biometricCode } = req.params;

    // Find employee by biometricCode
    const employee = await Employee.findOne({ biometricCode }).select(
      "_id fullName email biometricCode biometricEnabled userId",
    );

    // Also try with normalized code (leading zeros removed)
    const normalizedCode = biometricCode.replace(/^0+/, "");
    const employeeByNormalized =
      normalizedCode !== biometricCode
        ? await Employee.findOne({ biometricCode: normalizedCode }).select(
            "_id fullName email biometricCode biometricEnabled userId",
          )
        : null;

    // Find recent biometric logs - try both exact and normalized
    const logQuery =
      normalizedCode !== biometricCode
        ? { $or: [{ biometricCode }, { biometricCode: normalizedCode }] }
        : { biometricCode };

    const recentLogs = await BiometricLog.find(logQuery)
      .sort({ eventTime: -1 })
      .limit(10)
      .select(
        "eventTime eventType attendanceDate employeeId vendorLogId biometricCode",
      );

    // Find recent attendance records
    const employeeId = employee?._id || employeeByNormalized?._id;
    const recentAttendance = employeeId
      ? await Attendance.find({ employeeId })
          .sort({ date: -1 })
          .limit(10)
          .select("date checkIn checkOut source status")
      : [];

    // Get ALL recent webhook logs (last 50) to see what codes are actually coming through
    const allRecentLogs = await BiometricLog.find()
      .sort({ eventTime: -1 })
      .limit(50)
      .select("eventTime eventType biometricCode employeeId createdAt");

    // Get unique codes from recent logs
    const uniqueCodes = [
      ...new Set(allRecentLogs.map((log) => log.biometricCode)),
    ];

    // For each unique code, find which employee it belongs to
    const codeToEmployeeMap = {};
    for (const code of uniqueCodes) {
      const emp = await Employee.findOne({ biometricCode: code }).select(
        "fullName email biometricCode",
      );
      if (emp) {
        codeToEmployeeMap[code] = {
          fullName: emp.fullName,
          email: emp.email,
          biometricCode: emp.biometricCode,
          matched: true,
        };
      } else {
        // Try normalized version
        const normalized = code.replace(/^0+/, "");
        if (normalized !== code) {
          const empNorm = await Employee.findOne({
            biometricCode: normalized,
          }).select("fullName email biometricCode");
          if (empNorm) {
            codeToEmployeeMap[code] = {
              fullName: empNorm.fullName,
              email: empNorm.email,
              biometricCode: empNorm.biometricCode,
              note: `Matched via normalized code (${normalized})`,
              matched: true,
            };
          } else {
            codeToEmployeeMap[code] = {
              unmatched: true,
              normalizedCode: normalized,
            };
          }
        } else {
          codeToEmployeeMap[code] = { unmatched: true };
        }
      }
    }

    // Check if employee is enabled
    const isEnabled =
      employee?.biometricEnabled ||
      employeeByNormalized?.biometricEnabled ||
      false;

    return res.status(200).json({
      success: true,
      data: {
        biometricCode,
        normalizedCode:
          normalizedCode !== biometricCode ? normalizedCode : null,
        employee: employee
          ? {
              id: employee._id,
              fullName: employee.fullName,
              email: employee.email,
              biometricCode: employee.biometricCode,
              biometricEnabled: employee.biometricEnabled,
              userId: employee.userId,
            }
          : employeeByNormalized
            ? {
                id: employeeByNormalized._id,
                fullName: employeeByNormalized.fullName,
                email: employeeByNormalized.email,
                biometricCode: employeeByNormalized.biometricCode,
                biometricEnabled: employeeByNormalized.biometricEnabled,
                userId: employeeByNormalized.userId,
                note: "Found with normalized code (leading zeros removed)",
              }
            : null,
        isEnabled,
        recentLogs: recentLogs.map((log) => ({
          eventTime: log.eventTime,
          eventType: log.eventType,
          attendanceDate: log.attendanceDate,
          hasEmployeeId: !!log.employeeId,
          vendorLogId: log.vendorLogId,
          biometricCode: log.biometricCode,
        })),
        recentAttendance: recentAttendance.map((att) => ({
          date: att.date,
          checkIn: att.checkIn,
          checkOut: att.checkOut,
          source: att.source,
          status: att.status,
        })),
        allRecentWebhookCodes: uniqueCodes.slice(0, 20), // Show first 20 unique codes
        codeToEmployeeMap: codeToEmployeeMap, // Map of codes to employees
        totalRecentWebhooks: allRecentLogs.length,
        summary: {
          employeeFound: !!(employee || employeeByNormalized),
          biometricEnabled: isEnabled,
          logsCount: recentLogs.length,
          attendanceCount: recentAttendance.length,
          lastLogTime: recentLogs[0]?.eventTime || null,
          lastAttendanceDate: recentAttendance[0]?.date || null,
          totalWebhooksReceived: allRecentLogs.length,
        },
      },
    });
  } catch (error) {
    console.error("Diagnostic error:", error);
    return res.status(500).json({
      success: false,
      message: "Diagnostic failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
