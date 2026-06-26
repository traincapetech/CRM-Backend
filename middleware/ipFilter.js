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
  let cleanIP = ip.trim();
  if (cleanIP.startsWith("::ffff:")) cleanIP = cleanIP.split(":").pop();
  if (cleanIP === "::1") return "127.0.0.1";
  return cleanIP;
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
 * Expands a simplified IPv6 address string to its full 39-character format.
 */
const expandIPv6 = (ip) => {
  if (!ip || ip.includes(".")) return "";
  let fullIP = ip.toLowerCase();
  if (fullIP.includes("::")) {
    const parts = fullIP.split("::");
    const leftParts = parts[0] ? parts[0].split(":") : [];
    const rightParts = parts[1] ? parts[1].split(":") : [];
    const missingCount = 8 - (leftParts.length + rightParts.length);
    const middleParts = Array(missingCount).fill("0000");
    fullIP = [...leftParts, ...middleParts, ...rightParts].join(":");
  }
  return fullIP
    .split(":")
    .map((group) => group.padStart(4, "0"))
    .join(":");
};

/**
 * Checks if a given IP address matches a specific network or range (IPv4 or IPv6).
 */
const isIPInRange = (ip, network) => {
  const normalizedIP = normalizeIP(ip);
  const normalizedNetwork = network.trim();

  // Loopback support
  const loopbacks = ["127.0.0.1", "::1", "localhost"];
  if (loopbacks.includes(normalizedNetwork)) {
    return loopbacks.includes(normalizedIP);
  }

  // Handle case where network is not a range (no CIDR slash)
  if (!normalizedNetwork.includes("/")) {
    if (normalizedIP.includes(":") && normalizedNetwork.includes(":")) {
      return expandIPv6(normalizedIP) === expandIPv6(normalizedNetwork);
    }
    return normalizedIP === normalizedNetwork;
  }

  const [rangeIP, prefixLengthStr] = normalizedNetwork.split("/");
  const prefixLength = parseInt(prefixLengthStr, 10);

  // IPv4 Range Matching
  if (normalizedIP.includes(".") && rangeIP.includes(".")) {
    if (isNaN(prefixLength) || prefixLength < 0 || prefixLength > 32) return false;
    const mask = prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0;
    const networkNum = ipToNumber(rangeIP);
    const ipNum = ipToNumber(normalizedIP);
    return (ipNum & mask) === (networkNum & mask);
  }

  // IPv6 Range Matching
  if (normalizedIP.includes(":") && rangeIP.includes(":")) {
    if (isNaN(prefixLength) || prefixLength < 0 || prefixLength > 128) return false;
    const fullIP = expandIPv6(normalizedIP);
    const fullRange = expandIPv6(rangeIP);
    if (!fullIP || !fullRange) return false;

    const ipHex = fullIP.replace(/:/g, "");
    const rangeHex = fullRange.replace(/:/g, "");

    const fullHexChars = Math.floor(prefixLength / 4);
    const remainingBits = prefixLength % 4;

    if (ipHex.slice(0, fullHexChars) !== rangeHex.slice(0, fullHexChars)) {
      return false;
    }

    if (remainingBits > 0) {
      const ipCharVal = parseInt(ipHex[fullHexChars], 16);
      const rangeCharVal = parseInt(rangeHex[fullHexChars], 16);
      const mask = (0xf << (4 - remainingBits)) & 0xf;
      if ((ipCharVal & mask) !== (rangeCharVal & mask)) {
        return false;
      }
    }
    return true;
  }

  return false;
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

/**
 * Reusable IP matching function for HTTP middleware and WebSockets
 */
const isIPAllowed = async (ip) => {
  const clientIP = normalizeIP(ip);

  // Refresh cache if expired
  if (Date.now() - lastCacheUpdate > CACHE_TTL) {
    await refreshCache();
  }

  const envPrivate = process.env.ALLOWED_IP_RANGES ? process.env.ALLOWED_IP_RANGES.split(",").map(i => i.trim()) : [];
  const envPublic = process.env.ALLOWED_PUBLIC_IPS ? process.env.ALLOWED_PUBLIC_IPS.split(",").map(i => i.trim()) : [];
  
  const allNetworksToEvaluate = [
    ...cachedNetworks,
    { officeName: ".env Fallback", privateRanges: envPrivate, publicIPs: envPublic }
  ];

  let allowedOffice = null;
  for (const office of allNetworksToEvaluate) {
    const combined = [...(office.privateRanges || []), ...(office.publicIPs || [])];
    const isMatched = combined.some(range => isIPInRange(clientIP, range));
    if (isMatched) {
      allowedOffice = office.officeName;
      break;
    }
  }

  if (!allowedOffice && ["127.0.0.1", "::1", "localhost"].includes(clientIP)) {
    allowedOffice = "Localhost";
  }

  return {
    isAllowed: !!allowedOffice,
    officeName: allowedOffice,
    clientIP
  };
};

const ipFilter = async (req, res, next) => {
  if (process.env.ENABLE_IP_FILTER !== "true") return next();

  // Bypasses
  const bypassPaths = ["/health", "/api/health", "/api/public/health", "/api/logs"];
  if (bypassPaths.some(hp => req.path === hp || req.originalUrl === hp)) {
    return next();
  }

  // Public Onboarding Portal Bypass
  if (req.originalUrl.includes("/api/onboarding/portal") || req.path.includes("/api/onboarding/portal")) {
    return next();
  }

  if (req.originalUrl.includes("/api/biometric/webhook") || req.path.includes("/api/biometric/webhook")) {
    return next();
  }

  const rawIP = req.ip;
  const clientIP = normalizeIP(rawIP);
  const logCtx = `| Path: ${req.originalUrl || req.path} | Method: ${req.method}`;

  // Detailed debugging logs for root-cause analysis (Check 4)
  if (process.env.DEBUG_IP === "true" || process.env.NODE_ENV === "development") {
    console.log("------- IP FILTER DEBUG START -------");
    console.log("x-forwarded-for:", req.headers["x-forwarded-for"]);
    console.log("req.ip:", req.ip);
    console.log("remoteAddress:", req.socket.remoteAddress);
    console.log("Detected IP:", clientIP);
    console.log("-------------------------------------");
  }

  const { isAllowed, officeName } = await isIPAllowed(clientIP);

  if (isAllowed) {
    if (process.env.DEBUG_IP === "true" || process.env.NODE_ENV === "development") {
      console.log(`✅ Allowed IP: ${clientIP} | Office: ${officeName} ${logCtx}`);
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
module.exports.isIPAllowed = isIPAllowed;
module.exports.normalizeIP = normalizeIP;
module.exports.isIPInRange = isIPInRange;
