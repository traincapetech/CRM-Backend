/**
 * Production-Grade IP Filter Middleware
 */

const normalizeIP = (ip) => {
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) return ip.split(":").pop();
  if (ip === "::1") return "127.0.0.1";
  return ip;
};

const ipToNumber = (ip) => {
  const octets = ip.split(".");
  if (octets.length !== 4) return 0;
  return (octets.reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0);
};

const isIPInRange = (ip, network) => {
  const normalizedIP = normalizeIP(ip);
  const normalizedNetwork = network.trim();

  const loopbacks = ["127.0.0.1", "::1", "localhost"];
  if (loopbacks.includes(normalizedNetwork)) {
    return loopbacks.includes(normalizedIP) || normalizedIP === "127.0.0.1";
  }

  if (!normalizedNetwork.includes("/")) return normalizedIP === normalizedNetwork;

  const [rangeIP, prefixLength] = normalizedNetwork.split("/");
  const prefix = parseInt(prefixLength, 10);
  
  if (!normalizedIP.includes(".") || !rangeIP.includes(".")) return normalizedIP === rangeIP;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipToNumber(normalizedIP) & mask) === (ipToNumber(rangeIP) & mask);
};

const getAllowedNetworks = () => {
  const ranges = process.env.ALLOWED_IP_RANGES ? process.env.ALLOWED_IP_RANGES.split(",") : [];
  const publics = process.env.ALLOWED_PUBLIC_IPS ? process.env.ALLOWED_PUBLIC_IPS.split(",") : [];
  const all = ["127.0.0.1", "::1", "localhost", ...ranges, ...publics].map(i => i.trim()).filter(Boolean);
  return all;
};

// Startup Diagnostic & Validation
const isEnabled = process.env.ENABLE_IP_FILTER === "true";
if (isEnabled) {
  const networks = getAllowedNetworks();
  console.log("--------------------------------------------------");
  console.log("🛡️  IP Filter: ENABLED");
  
  if (networks.length <= 3) { // Only localhost/loopback
    console.warn("⚠️  WARNING: IP Filter is enabled but no external networks are configured in ALLOWED_IP_RANGES or ALLOWED_PUBLIC_IPS.");
  }
  
  console.log(`📡 Whitelisted Networks: ${networks.join(", ")}`);
  console.log("--------------------------------------------------");
}

const ipFilter = (req, res, next) => {
  if (process.env.ENABLE_IP_FILTER !== "true") return next();

  // 1. Production Healthcheck & Logs Bypass
  // /api/logs is bypassed so frontend can report errors even when blocked
  const healthPaths = ["/health", "/api/health", "/api/public/health", "/api/logs"];
  if (healthPaths.some(hp => req.path === hp || req.originalUrl === hp)) {
    return next();
  }

  // 2. Webhook Bypass (Keep existing biometric logic)
  if (req.originalUrl.includes("/api/biometric/webhook") || req.path.includes("/api/biometric/webhook")) {
    return next();
  }

  const clientIP = normalizeIP(req.ip);
  const allowedNetworks = getAllowedNetworks();
  const isAllowed = allowedNetworks.some((network) => isIPInRange(clientIP, network));
  const logCtx = `| Path: ${req.originalUrl || req.path} | Method: ${req.method}`;

  if (isAllowed) {
    // 3. Reduce Log Spam: Only log allowed requests in Dev or if DEBUG_IP is true
    if (process.env.NODE_ENV === "development" || process.env.DEBUG_IP === "true") {
      console.log(`✅ Allowed IP: ${clientIP} ${logCtx}`);
    }
    return next();
  }

  // Always log blocked requests
  console.error(`🚫 Blocked IP: ${clientIP} ${logCtx}`);
  
  return res.status(403).json({
    success: false,
    error: "IP_NOT_ALLOWED",
    message: "Access denied. Office network only."
  });
};

module.exports = ipFilter;
module.exports.helpers = { normalizeIP, isIPInRange };
