const axios = require("axios");
const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");
const BiometricLog = require("../models/BiometricLog");
const BiometricSettings = require("../models/BiometricSettings");

const startOfDay = (value) => {
  const date = new Date(value);
  // Use UTC to avoid timezone issues when storing dates
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
};

const normalizeDatePart = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!match) return raw;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  let year = match[3];
  if (year.length === 2) year = `20${year}`;
  return `${year}-${month}-${day}`;
};

const parseIstDateTime = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // Try standard ISO-like inputs first.
  const normalized = raw.replace(" ", "T");
  const withOffset =
    normalized.includes("+") || normalized.endsWith("Z")
      ? normalized
      : `${normalized}+05:30`;
  const parsed = new Date(withOffset);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  // Fallback for dd/mm/yyyy or dd-mm-yyyy formats.
  const [datePart, timePart] = raw.split(" ");
  const normalizedDate = normalizeDatePart(datePart);
  if (!normalizedDate) return null;
  const fallback = `${normalizedDate}T${timePart || "00:00:00"}+05:30`;
  const fallbackParsed = new Date(fallback);
  return Number.isNaN(fallbackParsed.getTime()) ? null : fallbackParsed;
};

const normalizeEventType = (value) => {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim().toUpperCase();
  if (
    ["IN", "I", "CHECKIN", "CHECK_IN", "CHECK-IN", "ENTRY", "0"].includes(raw)
  )
    return "IN";
  if (
    ["OUT", "O", "CHECKOUT", "CHECK_OUT", "CHECK-OUT", "EXIT", "1"].includes(
      raw,
    )
  )
    return "OUT";
  if (raw.includes("IN")) return "IN";
  if (raw.includes("OUT")) return "OUT";
  return null;
};

const getFieldValue = (log, keys) => {
  for (const key of keys) {
    if (log[key] !== undefined && log[key] !== null && log[key] !== "") {
      return log[key];
    }
  }
  return null;
};

const extractEventTime = (log) => {
  const directDateTime = getFieldValue(log, [
    "log_datetime",
    "log_date_time",
    "logDateTime",
    "LogDateTime",
    "LOGDATETIME",
    "date_time",
    "dateTime",
    "DateTime",
    "timestamp",
  ]);
  if (directDateTime) return parseIstDateTime(directDateTime);

  const logDate = getFieldValue(log, [
    "log_date",
    "logDate",
    "LogDate",
    "LOGDATE",
    "date",
    "Date",
  ]);
  const logTime = getFieldValue(log, [
    "log_time",
    "logTime",
    "LogTime",
    "LOGTIME",
    "time",
    "Time",
  ]);
  if (logDate && logTime) {
    return parseIstDateTime(`${logDate} ${logTime}`);
  }

  const fallbackDate = getFieldValue(log, [
    "download_date_time",
    "downloadDateTime",
  ]);
  if (fallbackDate) return parseIstDateTime(fallbackDate);

  return null;
};

const normalizeLogs = (payload) => {
  if (!payload) return [];

  let logs = [];

  if (Array.isArray(payload)) {
    logs = payload;
  } else if (typeof payload === "object") {
    // Check for wrapper keys first
    logs =
      payload.logs ||
      payload.data ||
      payload.events ||
      payload.attendance ||
      payload.attendanceLogs ||
      payload.attendance_log ||
      payload.Logs ||
      payload.Data ||
      payload.Events ||
      payload.Attendance ||
      payload.AttendanceLogs;

    // If no wrapper found, treat the payload itself as a single log entry
    if (!logs) {
      logs = [payload];
    }
  } else {
    return [];
  }

  if (!Array.isArray(logs)) return [];

  return logs
    .map((log) => {
      const biometricCode = getFieldValue(log, [
        "employee_code",
        "empCode",
        "emp_code",
        "emp_id",
        "employeeCode",
        "EmployeeCode",
        "EmpCode",
        "EmpID",
        "empId",
        "employee_id",
      ]);
      const eventTime = extractEventTime(log);
      const eventType =
        normalizeEventType(
          getFieldValue(log, [
            "in_out",
            "inOut",
            "inout",
            "direction",
            "status",
            "type",
            "io",
            "ioType",
            "checkType",
            "attendanceType",
            "InOut",
            "Direction",
            "Status",
          ]),
        ) || "PUNCH";
      const vendorLogId = getFieldValue(log, [
        "log_id",
        "logId",
        "id",
        "attendance_id",
        "attendanceId",
        "LogId",
        "AttendanceId",
      ]);
      const deviceSerial = getFieldValue(log, [
        "device_sn",
        "deviceSerial",
        "device_serial",
        "DeviceSerialNo",
        "DeviceSerial",
        "deviceNo",
        "device_no",
      ]);

      if (!biometricCode) {
        console.warn("⚠️ Dropping log: Missing biometric code", log);
        return null;
      }
      if (!eventTime) {
        console.warn("⚠️ Dropping log: Invalid or missing event time", log);
        return null;
      }
      if (!eventType) {
        console.warn("⚠️ Dropping log: Invalid event type", log);
        return null;
      }

      return {
        biometricCode: biometricCode ? String(biometricCode).trim() : null,
        eventTime,
        eventType,
        ...(vendorLogId ? { vendorLogId } : {}),
        deviceSerial,
        rawPayload: log,
      };
    })
    .filter((log) => log !== null);
};

const normalizeBiometricCode = (value) => {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const numeric = raw.replace(/^0+/, "");
  return numeric ? numeric : raw;
};

const ensureEmployeeMap = async (biometricCodes) => {
  const employees = await Employee.find({
    biometricCode: { $in: biometricCodes },
    biometricEnabled: true,
  }).select("_id biometricCode userId");

  return employees.reduce((acc, employee) => {
    acc[employee.biometricCode] = employee;
    return acc;
  }, {});
};

const upsertLogs = async (logs) => {
  if (!logs.length) return;
  const ops = logs.map((log) => ({
    updateOne: {
      filter: log.vendorLogId
        ? { vendorLogId: log.vendorLogId }
        : {
            biometricCode: log.biometricCode,
            eventTime: log.eventTime,
            eventType: log.eventType,
          },
      update: { $setOnInsert: log },
      upsert: true,
    },
  }));

  try {
    const result = await BiometricLog.bulkWrite(ops, { ordered: false });
    console.log("BiometricLog bulkWrite result:", {
      inserted: result.insertedCount,
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
      matched: result.matchedCount,
    });
  } catch (error) {
    if (error.code !== 11000) {
      console.error("Biometric log upsert error:", error.message);
    } else {
      console.warn(
        "Biometric log upsert duplicate (safe to ignore):",
        error.message,
      );
    }
  }
};

const updateAttendanceForDay = async (employee, attendanceDate) => {
  const logs = await BiometricLog.find({
    employeeId: employee._id,
    attendanceDate,
  }).sort({ eventTime: 1 });

  if (!logs.length) return { updated: false };

  const inLogs = logs.filter((log) => log.eventType === "IN");
  const outLogs = logs.filter((log) => log.eventType === "OUT");
  const punchLogs = logs.filter((log) => log.eventType === "PUNCH");

  let checkIn = null;
  let checkOut = null;

  if (inLogs.length || outLogs.length) {
    checkIn = (inLogs[0] || logs[0]).eventTime;
    checkOut = outLogs.length ? outLogs[outLogs.length - 1].eventTime : null;
  } else if (punchLogs.length) {
    checkIn = punchLogs[0].eventTime;
    checkOut =
      punchLogs.length > 1 ? punchLogs[punchLogs.length - 1].eventTime : null;
  }

  const attendance = await Attendance.findOne({
    employeeId: employee._id,
    date: attendanceDate,
  });
  if (attendance) {
    if (attendance.source === "MANUAL") {
      return { updated: false, skipped: true };
    }
    attendance.checkIn = checkIn;
    attendance.checkOut = checkOut;
    attendance.source = "BIOMETRIC";
    attendance.notes = attendance.notes || "Synced from biometric logs";
    await attendance.save();
    return { updated: true };
  }

  const newAttendance = await Attendance.create({
    employeeId: employee._id,
    userId: employee.userId || null,
    date: attendanceDate,
    checkIn,
    checkOut,
    source: "BIOMETRIC",
    notes: "Synced from biometric logs",
  });

  console.log("Biometric attendance created:", {
    attendanceId: newAttendance._id,
    employeeId: employee._id,
    date: newAttendance.date.toISOString(),
    checkIn: newAttendance.checkIn?.toISOString(),
    checkOut: newAttendance.checkOut?.toISOString(),
  });

  return { created: true };
};

const syncAttendanceLogs = async (payload) => {
  console.log(
    "📥 Raw webhook payload received:",
    JSON.stringify(payload, null, 2),
  );

  const normalizedLogs = normalizeLogs(payload);
  console.log("✅ Normalized logs:", normalizedLogs.length, "records");

  if (!normalizedLogs.length) {
    console.warn("⚠️ No valid logs found in payload");
    return { processed: 0, created: 0, updated: 0, skipped: 0, unmatched: 0 };
  }

  const biometricCodes = [
    ...new Set(normalizedLogs.map((log) => log.biometricCode)),
  ];
  console.log("🔍 Looking for employees with codes:", biometricCodes);

  const employeeMap = await ensureEmployeeMap(biometricCodes);
  console.log(
    "👥 Found employees:",
    Object.keys(employeeMap).length,
    "matched out of",
    biometricCodes.length,
    "codes",
  );

  const preparedLogs = [];
  let unmatched = 0;

  const normalizedEmployeeMap = Object.values(employeeMap).reduce(
    (acc, employee) => {
      const normalizedCode = normalizeBiometricCode(employee.biometricCode);
      if (!normalizedCode) return acc;
      if (!acc[normalizedCode]) {
        acc[normalizedCode] = employee;
      }
      return acc;
    },
    {},
  );

  normalizedLogs.forEach((log) => {
    const employee =
      employeeMap[log.biometricCode] ||
      normalizedEmployeeMap[normalizeBiometricCode(log.biometricCode)];
    if (!employee) {
      unmatched += 1;
      console.warn("⚠️ Unmatched biometric log:", {
        biometricCode: log.biometricCode,
        normalizedCode: normalizeBiometricCode(log.biometricCode),
        eventTime: log.eventTime?.toISOString(),
        availableCodes: Object.keys(employeeMap).slice(0, 5), // Show first 5 for debugging
      });
      return;
    }
    preparedLogs.push({
      biometricCode: log.biometricCode,
      employeeId: employee._id,
      eventTime: log.eventTime,
      eventType: log.eventType,
      attendanceDate: startOfDay(log.eventTime),
      vendorLogId: log.vendorLogId,
      deviceSerial: log.deviceSerial,
      rawPayload: log.rawPayload,
    });
  });

  await upsertLogs(preparedLogs);

  const dayKeys = new Map();
  preparedLogs.forEach((log) => {
    const key = `${log.employeeId}_${log.attendanceDate.toISOString()}`;
    dayKeys.set(key, {
      employeeId: log.employeeId,
      attendanceDate: log.attendanceDate,
    });
    console.log("Biometric log prepared:", {
      biometricCode: log.biometricCode,
      employeeId: log.employeeId,
      attendanceDate: log.attendanceDate.toISOString(),
      eventTime: log.eventTime?.toISOString(),
      eventType: log.eventType,
    });
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const { employeeId, attendanceDate } of dayKeys.values()) {
    const employee = Object.values(employeeMap).find(
      (emp) => emp._id.toString() === employeeId.toString(),
    );
    if (!employee) continue;
    const result = await updateAttendanceForDay(employee, attendanceDate);
    if (result.created) created += 1;
    if (result.updated) updated += 1;
    if (result.skipped) skipped += 1;
  }

  return {
    processed: preparedLogs.length,
    created,
    updated,
    skipped,
    unmatched,
  };
};

const buildAuthHeaders = (settings) => {
  if (!settings?.apiKey) return {};
  if (settings.authType === "BEARER") {
    return { Authorization: `Bearer ${settings.apiKey}` };
  }
  return { "x-api-key": settings.apiKey };
};

const fetchVendorLogs = async (settings, options = {}) => {
  if (!settings?.apiBaseUrl) {
    throw new Error("Biometric API base URL is not configured");
  }

  const headers = buildAuthHeaders(settings);
  headers["Content-Type"] = "application/json";

  // Build query parameters for date range (if vendor supports it)
  const params = {};

  // Historical sync: fetch from a specific start date
  if (options.historicalSync && options.startDate) {
    params.from_date = options.startDate; // Format: YYYY-MM-DD or vendor format
    params.to_date = options.endDate || new Date().toISOString().split("T")[0];
    console.log("Historical sync requested:", {
      from: params.from_date,
      to: params.to_date,
    });
  } else if (options.fromDate) {
    params.from_date = options.fromDate;
  }

  if (options.toDate) {
    params.to_date = options.toDate;
  }

  // Regular sync: fetch since last sync
  if (
    !options.historicalSync &&
    !options.fromDate &&
    options.lastSyncAt &&
    settings.lastSyncAt
  ) {
    const lastSync = new Date(settings.lastSyncAt);
    params.from_date = lastSync.toISOString().split("T")[0];
  }

  // Add common vendor API parameters
  if (options.page) {
    params.page = options.page;
  }
  if (options.limit) {
    params.limit = options.limit;
  }

  console.log("Fetching vendor logs:", {
    url: settings.apiBaseUrl,
    params,
    hasAuth: !!settings.apiKey,
    historicalSync: options.historicalSync || false,
  });

  const response = await axios.get(settings.apiBaseUrl, {
    headers,
    params,
    timeout: 30000, // 30 second timeout for large historical fetches
  });

  console.log("Vendor API response:", {
    status: response.status,
    dataType: typeof response.data,
    isArray: Array.isArray(response.data),
    keys:
      response.data && !Array.isArray(response.data)
        ? Object.keys(response.data)
        : "N/A",
    logCount: Array.isArray(response.data)
      ? response.data.length
      : response.data?.logs?.length || response.data?.data?.length || "N/A",
  });

  return response.data;
};

const runBiometricPullSync = async (options = {}) => {
  const settings = await BiometricSettings.findOne();
  if (!settings || !settings.enabled) {
    return { skipped: true, reason: "Biometric integration disabled" };
  }

  if (!settings.apiBaseUrl) {
    return {
      skipped: true,
      reason: "API Base URL not configured. Webhook will still work.",
    };
  }

  try {
    console.log("Starting biometric pull sync...", {
      lastSyncAt: settings.lastSyncAt,
      syncInterval: settings.syncIntervalMinutes,
    });

    // Fetch logs from vendor (with date range if supported)
    const payload = await fetchVendorLogs(settings, {
      lastSyncAt: !options.forceFullSync && settings.lastSyncAt,
      ...options,
    });

    // Process all logs (for all employees)
    const result = await syncAttendanceLogs(payload);

    // Update last sync time
    settings.lastSyncAt = new Date();
    await settings.save();

    console.log("Biometric pull sync completed:", result);

    return result;
  } catch (error) {
    console.error("Biometric pull sync error:", error.message);
    throw error;
  }
};

module.exports = {
  syncAttendanceLogs,
  runBiometricPullSync,
  fetchVendorLogs,
  normalizeLogs,
};
