/**
 * Redis Caching Middleware
 *
 * Caches GET requests to reduce database load and improve response times
 */

const { getRedisClient, isRedisAvailable } = require("../config/redis");

/**
 * Cache middleware for API responses
 * @param {number} duration - Cache duration in seconds (default: 300 = 5 minutes)
 */
const cacheMiddleware = (duration = 300) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== "GET") {
      return next();
    }

    // Skip if Redis not available
    if (!isRedisAvailable()) {
      return next();
    }

    // Cache version - Change this to invalidate all existing caches
    const CACHE_VERSION = "v2";
    const redis = getRedisClient();
    const key = `cache:${CACHE_VERSION}:${req.originalUrl || req.url}:${req.user?.id || "public"}`;

    try {
      // Try to get cached response
      const cachedResponse = await redis.get(key);

      if (cachedResponse) {
        // Cache hit - return cached data
        console.log(`💨 Cache HIT: ${req.originalUrl}`);
        return res.json(JSON.parse(cachedResponse));
      }

      // Cache miss - store original res.json
      const originalJson = res.json.bind(res);

      res.json = (data) => {
        // Cache the response
        redis.setex(key, duration, JSON.stringify(data)).catch((err) => {
          console.error("Cache write error:", err.message);
        });

        console.log(
          `💾 Cache MISS: ${req.originalUrl} (cached for ${duration}s)`,
        );
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error("Cache middleware error:", error.message);
      next();
    }
  };
};

/**
 * Clear cache by pattern
 * @param {string} pattern - Redis key pattern to clear
 */
const clearCacheByPattern = async (pattern) => {
  if (!isRedisAvailable()) {
    return;
  }

  const redis = getRedisClient();

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`🗑️  Cleared ${keys.length} cache keys matching: ${pattern}`);
    }
  } catch (error) {
    console.error("Cache clear error:", error.message);
  }
};

/**
 * Clear all cache
 */
const clearAllCache = async () => {
  if (!isRedisAvailable()) {
    return;
  }

  const redis = getRedisClient();

  try {
    await redis.flushdb();
    console.log("🗑️  All cache cleared");
  } catch (error) {
    console.error("Cache flush error:", error.message);
  }
};

/**
 * Invalidate cache on data changes
 * Use this middleware on POST/PUT/DELETE routes to clear related cache
 */
const invalidateCache = (patterns = []) => {
  return async (req, res, next) => {
    // Store original functions
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    // Override response methods
    res.json = async function (data) {
      // Clear cache after successful response
      if (res.statusCode >= 200 && res.statusCode < 300) {
        for (const pattern of patterns) {
          await clearCacheByPattern(pattern);
        }
      }
      return originalJson(data);
    };

    res.send = async function (data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        for (const pattern of patterns) {
          await clearCacheByPattern(pattern);
        }
      }
      return originalSend(data);
    };

    next();
  };
};

module.exports = {
  cacheMiddleware,
  clearCacheByPattern,
  clearAllCache,
  invalidateCache,
};
