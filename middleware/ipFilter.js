const OfficeNetwork = require("../models/OfficeNetwork");

/**
 * IP Filter Middleware with Dynamic DB-managed Whitelist and Caching
 */

let cachedNetworks = [];
let lastCacheUpdate = 0;
const CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Normalizes IP addresses, specifically handling IPv6-mapped IPv4 addresses.
 */
const normalizeIP = (ip) => {
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) return ip.split(":").pop();
  if (ip === "::1") return "127.0.0.1";
  return ip;
};

/**
 * Converts an IPv4 address string to a 32-bit unsigned integer.
 */
const ipToNumber = (ip) => {
  const octets = ip.split(".");
  if (octets.length !== 4) return 0;
  return (
    octets.reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
  );
};

/**
 * Checks if a given IP address matches a specific network or range.
 */
const isIPInRange = (ip, network) => {
  const normalizedIP = normalizeIP(ip);
  const normalizedNetwork = network.trim();

  // Loopback support
  const loopbacks = ["127.0.0.1", "::1", "localhost"];
  if (loopbacks.includes(normalizedNetwork)) {
    return loopbacks.includes(normalizedIP);
  }

  if (!normalizedNetwork.includes("/")) {
    return normalizedIP === normalizedNetwork;
  }

  const [rangeIP, prefixLength] = normalizedNetwork.split("/");
  const prefix = parseInt(prefixLength, 10);

  if (!normalizedIP.includes(".") || !rangeIP.includes(".")) {
    return normalizedIP === rangeIP;
  }

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const networkNum = ipToNumber(rangeIP);
  const ipNum = ipToNumber(normalizedIP);

  return (ipNum & mask) === (networkNum & mask);
};

/**
 * Refreshes the in-memory cache of active office networks from DB.
 */
const refreshCache = async () => {
  try {
    const activeNetworks = await OfficeNetwork.find({ status: true });
    cachedNetworks = activeNetworks;
    lastCacheUpdate = Date.now();
    
    if (process.env.DEBUG_IP === "true") {
      console.log(`📡 IP Filter: Cache refreshed. ${cachedNetworks.length} offices loaded.`);
    }
  } catch (error) {
    console.error("❌ IP Filter Cache Refresh Error:", error);
  }
};

/**
 * Seeding logic: Migration from .env to DB
 */
const seedFromEnv = async () => {
  try {
    const count = await OfficeNetwork.countDocuments();
    if (count === 0) {
      const User = require("../models/User");
      const admin = await User.findOne({ role: "Admin" });
      
      if (admin && (process.env.ALLOWED_IP_RANGES || process.env.ALLOWED_PUBLIC_IPS)) {
        await OfficeNetwork.create({
          officeName: "Delhi Office (Migrated)",
          privateRanges: process.env.ALLOWED_IP_RANGES ? process.env.ALLOWED_IP_RANGES.split(",").map(i => i.trim()) : [],
          publicIPs: process.env.ALLOWED_PUBLIC_IPS ? process.env.ALLOWED_PUBLIC_IPS.split(",").map(i => i.trim()) : [],
          status: true,
          createdBy: admin._id,
        });
        console.log("✅ IP Filter: Migrated .env values to DB (Delhi Office).");
        await refreshCache();
      }
    }
  } catch (error) {
    console.error("❌ IP Filter Seeding Error:", error);
  }
};

// Initial cache load
refreshCache().then(() => seedFromEnv());

const ipFilter = async (req, res, next) => {
  if (process.env.ENABLE_IP_FILTER !== "true") return next();

  // Bypasses
  const bypassPaths = ["/health", "/api/health", "/api/public/health", "/api/logs"];
  if (bypassPaths.some(hp => req.path === hp || req.originalUrl === hp)) {
    return next();
  }
  if (req.originalUrl.includes("/api/biometric/webhook") || req.path.includes("/api/biometric/webhook")) {
    return next();
  }

  // Refresh cache if expired
  if (Date.now() - lastCacheUpdate > CACHE_TTL) {
    await refreshCache();
  }

  const clientIP = normalizeIP(req.ip);
  const logCtx = `| Path: ${req.originalUrl || req.path} | Method: ${req.method}`;

  // Check against cached networks
  let allowedOffice = null;
  for (const office of cachedNetworks) {
    const combined = [...(office.privateRanges || []), ...(office.publicIPs || [])];
    const isMatched = combined.some(range => isIPInRange(clientIP, range));
    if (isMatched) {
      allowedOffice = office.officeName;
      break;
    }
  }

  // Fallback for loopback if not explicitly in DB
  if (!allowedOffice && ["127.0.0.1", "::1", "localhost"].includes(clientIP)) {
    allowedOffice = "Localhost";
  }

  if (allowedOffice) {
    if (process.env.DEBUG_IP === "true" || process.env.NODE_ENV === "development") {
      console.log(`✅ Allowed IP: ${clientIP} | Office: ${allowedOffice} ${logCtx}`);
    }
    return next();
  }

  console.error(`🚫 Blocked IP: ${clientIP} ${logCtx}`);
  
  return res.status(403).json({
    success: false,
    error: "IP_NOT_ALLOWED",
    message: "Access denied. Office network only."
  });
};

module.exports = ipFilter;
module.exports.refreshCache = refreshCache;
