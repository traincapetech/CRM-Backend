const axios = require('axios');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const BiometricLog = require('../models/BiometricLog');
const BiometricSettings = require('../models/BiometricSettings');

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const parseIstDateTime = (dateTimeString) => {
  if (!dateTimeString || typeof dateTimeString !== 'string') return null;
  const normalized = dateTimeString.trim().replace(' ', 'T');
  const withOffset = normalized.includes('+') || normalized.endsWith('Z')
    ? normalized
    : `${normalized}+05:30`;
  const parsed = new Date(withOffset);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeEventType = (value) => {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim().toUpperCase();
  if (['IN', 'I', 'CHECKIN', 'CHECK_IN', 'CHECK-IN', 'ENTRY', '0'].includes(raw)) return 'IN';
  if (['OUT', 'O', 'CHECKOUT', 'CHECK_OUT', 'CHECK-OUT', 'EXIT', '1'].includes(raw)) return 'OUT';
  if (raw.includes('IN')) return 'IN';
  if (raw.includes('OUT')) return 'OUT';
  return null;
};

const extractEventTime = (log) => {
  if (log.log_datetime) return parseIstDateTime(log.log_datetime);
  if (log.logDateTime) return parseIstDateTime(log.logDateTime);
  if (log.log_time && log.log_date) {
    return parseIstDateTime(`${log.log_date} ${log.log_time}`);
  }
  if (log.logTime && log.logDate) {
    return parseIstDateTime(`${log.logDate} ${log.logTime}`);
  }
  if (log.timestamp) return new Date(log.timestamp);
  return null;
};

const normalizeLogs = (payload) => {
  if (!payload) return [];
  const logs = Array.isArray(payload)
    ? payload
    : (payload.logs || payload.data || payload.events || []);

  if (!Array.isArray(logs)) return [];

  return logs.map((log) => {
    const biometricCode = log.employee_code || log.empCode || log.emp_code || log.emp_id || log.employeeCode;
    const eventTime = extractEventTime(log);
    const eventType = normalizeEventType(log.in_out || log.inOut || log.inout || log.direction || log.status || log.type) || 'PUNCH';
    const vendorLogId = log.log_id || log.logId || log.id || log.attendance_id || log.attendanceId || null;
    const deviceSerial = log.device_sn || log.deviceSerial || log.device_serial || null;

    return {
      biometricCode: biometricCode ? String(biometricCode).trim() : null,
      eventTime,
      eventType,
      vendorLogId,
      deviceSerial,
      rawPayload: log
    };
  }).filter((log) => log.biometricCode && log.eventTime && log.eventType);
};

const ensureEmployeeMap = async (biometricCodes) => {
  const employees = await Employee.find({
    biometricCode: { $in: biometricCodes },
    biometricEnabled: true
  }).select('_id biometricCode userId');

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
        : { biometricCode: log.biometricCode, eventTime: log.eventTime, eventType: log.eventType },
      update: { $setOnInsert: log },
      upsert: true
    }
  }));

  try {
    await BiometricLog.bulkWrite(ops, { ordered: false });
  } catch (error) {
    if (error.code !== 11000) {
      console.error('Biometric log upsert error:', error.message);
    }
  }
};

const updateAttendanceForDay = async (employee, attendanceDate) => {
  const logs = await BiometricLog.find({ employeeId: employee._id, attendanceDate })
    .sort({ eventTime: 1 });

  if (!logs.length) return { updated: false };

  const inLogs = logs.filter((log) => log.eventType === 'IN');
  const outLogs = logs.filter((log) => log.eventType === 'OUT');
  const punchLogs = logs.filter((log) => log.eventType === 'PUNCH');

  let checkIn = null;
  let checkOut = null;

  if (inLogs.length || outLogs.length) {
    checkIn = (inLogs[0] || logs[0]).eventTime;
    checkOut = outLogs.length ? outLogs[outLogs.length - 1].eventTime : null;
  } else if (punchLogs.length) {
    checkIn = punchLogs[0].eventTime;
    checkOut = punchLogs.length > 1 ? punchLogs[punchLogs.length - 1].eventTime : null;
  }

  const attendance = await Attendance.findOne({ employeeId: employee._id, date: attendanceDate });
  if (attendance) {
    if (attendance.source === 'MANUAL') {
      return { updated: false, skipped: true };
    }
    attendance.checkIn = checkIn;
    attendance.checkOut = checkOut;
    attendance.source = 'BIOMETRIC';
    attendance.notes = attendance.notes || 'Synced from biometric logs';
    await attendance.save();
    return { updated: true };
  }

  await Attendance.create({
    employeeId: employee._id,
    userId: employee.userId || null,
    date: attendanceDate,
    checkIn,
    checkOut,
    source: 'BIOMETRIC',
    notes: 'Synced from biometric logs'
  });

  return { created: true };
};

const syncAttendanceLogs = async (payload) => {
  const normalizedLogs = normalizeLogs(payload);
  if (!normalizedLogs.length) {
    return { processed: 0, created: 0, updated: 0, skipped: 0, unmatched: 0 };
  }

  const biometricCodes = [...new Set(normalizedLogs.map((log) => log.biometricCode))];
  const employeeMap = await ensureEmployeeMap(biometricCodes);

  const preparedLogs = [];
  let unmatched = 0;

  normalizedLogs.forEach((log) => {
    const employee = employeeMap[log.biometricCode];
    if (!employee) {
      unmatched += 1;
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
      rawPayload: log.rawPayload
    });
  });

  await upsertLogs(preparedLogs);

  const dayKeys = new Map();
  preparedLogs.forEach((log) => {
    const key = `${log.employeeId}_${log.attendanceDate.toISOString()}`;
    dayKeys.set(key, { employeeId: log.employeeId, attendanceDate: log.attendanceDate });
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const { employeeId, attendanceDate } of dayKeys.values()) {
    const employee = Object.values(employeeMap).find((emp) => emp._id.toString() === employeeId.toString());
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
    unmatched
  };
};

const buildAuthHeaders = (settings) => {
  if (!settings?.apiKey) return {};
  if (settings.authType === 'BEARER') {
    return { Authorization: `Bearer ${settings.apiKey}` };
  }
  return { 'x-api-key': settings.apiKey };
};

const fetchVendorLogs = async (settings) => {
  if (!settings?.apiBaseUrl) {
    throw new Error('Biometric API base URL is not configured');
  }
  const headers = buildAuthHeaders(settings);
  const response = await axios.get(settings.apiBaseUrl, { headers });
  return response.data;
};

const runBiometricPullSync = async () => {
  const settings = await BiometricSettings.findOne();
  if (!settings || !settings.enabled) {
    return { skipped: true, reason: 'Biometric integration disabled' };
  }

  const payload = await fetchVendorLogs(settings);
  const result = await syncAttendanceLogs(payload);
  settings.lastSyncAt = new Date();
  await settings.save();
  return result;
};

module.exports = {
  syncAttendanceLogs,
  runBiometricPullSync,
  fetchVendorLogs,
  normalizeLogs
};
