/**
 * IP Filter Middleware
 * 
 * Restricts access to the CRM based on IP addresses or IP ranges.
 * Supports:
 * - Single IP addresses
 * - IP ranges (CIDR notation, e.g., 192.168.1.0/24)
 * - Multiple networks
 * - Development mode bypass
 * - Proxy/load balancer IP detection
 */

// Convert IP to number for range checking
const ipToNumber = (ip) => {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
};

// Check if IP is in CIDR range
const isIPInRange = (ip, cidr) => {
  if (!cidr.includes('/')) {
    // Single IP address
    return ip === cidr;
  }

  const [network, prefixLength] = cidr.split('/');
  const prefix = parseInt(prefixLength, 10);
  const mask = ~(2 ** (32 - prefix) - 1);
  const networkNum = ipToNumber(network);
  const ipNum = ipToNumber(ip);

  return (ipNum & mask) === (networkNum & mask);
};

// Get real client IP (handles proxies, load balancers, etc.)
const getClientIP = (req) => {
  // Check various headers for the real IP
  const forwarded = req.headers['x-forwarded-for'];
  const realIP = req.headers['x-real-ip'];
  const cfConnectingIP = req.headers['cf-connecting-ip']; // Cloudflare

  // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2)
  // The first one is usually the original client IP
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[0];
  }

  if (realIP) {
    return realIP;
  }

  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Fallback to socket address
  return req.socket.remoteAddress || req.connection.remoteAddress || req.ip;
};

// Get allowed IPs/ranges from environment or use defaults
const getAllowedNetworks = () => {
  const networks = [];
  
  // Check environment variable for office network ranges (private IPs)
  if (process.env.ALLOWED_IP_RANGES) {
    networks.push(...process.env.ALLOWED_IP_RANGES.split(',').map(ip => ip.trim()));
  }
  
  // Check environment variable for public IPs (for cloud deployments)
  // This allows specific public IPs that your office uses when accessing internet
  if (process.env.ALLOWED_PUBLIC_IPS) {
    networks.push(...process.env.ALLOWED_PUBLIC_IPS.split(',').map(ip => ip.trim()));
  }

  return networks;
};

// Check if IP filtering is enabled
const isIPFilterEnabled = () => {
  return process.env.ENABLE_IP_FILTER === 'true' || process.env.ENABLE_IP_FILTER === '1';
};

// IP Filter Middleware
const ipFilter = (req, res, next) => {
  // Skip IP filtering in development mode unless explicitly enabled
  if (process.env.NODE_ENV === 'development' && process.env.ENABLE_IP_FILTER !== 'true') {
    return next();
  }

  // Check if IP filtering is enabled
  if (!isIPFilterEnabled()) {
    return next();
  }

  // Get allowed networks
  const allowedNetworks = getAllowedNetworks();

  // If no networks configured, allow all (safety fallback)
  if (allowedNetworks.length === 0) {
    console.warn('⚠️  IP Filter enabled but no allowed networks configured. Allowing all requests.');
    return next();
  }

  // Get client IP
  const clientIP = getClientIP(req);
  
  // Allow localhost/127.0.0.1 in development
  if (process.env.NODE_ENV === 'development' && (clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === 'localhost')) {
    return next();
  }

  // Check if IP matches any allowed network
  const isAllowed = allowedNetworks.some(network => {
    try {
      // For single IP addresses (no / in it), do exact match
      if (!network.includes('/')) {
        return clientIP === network;
      }
      // For CIDR ranges, use the range check
      return isIPInRange(clientIP, network);
    } catch (error) {
      console.error(`Error checking IP range ${network}:`, error);
      return false;
    }
  });

  if (isAllowed) {
    console.log(`✅ Allowed access from IP: ${clientIP}`);
    return next();
  }

  // Log blocked attempt with more details
  const privateRanges = process.env.ALLOWED_IP_RANGES || 'None';
  const publicIPs = process.env.ALLOWED_PUBLIC_IPS || 'None';
  console.warn(`🚫 Blocked access attempt from IP: ${clientIP}`);
  console.warn(`Allowed private networks: ${privateRanges}`);
  console.warn(`Allowed public IPs: ${publicIPs}`);
  console.warn(`All allowed networks/IPs: ${allowedNetworks.join(', ')}`);

  // Return 403 Forbidden
  return res.status(403).json({
    success: false,
    message: 'Access denied. This application is only accessible from the office network.',
    error: 'IP_NOT_ALLOWED',
    clientIP: clientIP,
    hint: 'Please connect to the office WiFi network to access this application.'
  });
};

module.exports = ipFilter;
