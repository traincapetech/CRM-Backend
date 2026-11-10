/**
 * Redis Configuration
 *
 * Provides Redis client for caching API responses and database queries
 */

const Redis = require("ioredis");

let redisClient = null;

const connectRedis = () => {
  // Only connect if REDIS_URL is provided and not disabled
  if (!process.env.REDIS_URL || process.env.DISABLE_REDIS === "true") {
    console.log("ℹ️  Redis caching is disabled or REDIS_URL not configured");
    console.log("   Continuing without cache...");
    return null;
  }

  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      retryStrategy: (times) => {
        if (times > 5) return null; // stop reconnecting after 5 attempts
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    redisClient.on("connect", () => {
      console.log("✅ Redis connected successfully");
    });

    redisClient.on("error", (err) => {
      console.error("❌ Redis connection error:", err.message);
      console.log("   Continuing without cache...");
      // If we hit the maxrequest limit, disable redis client to prevent future calls
      if (err.message && err.message.includes("max requests limit exceeded")) {
        console.warn("⚠️ Redis limit exceeded. Disabling cache features.");
        try {
          if (redisClient) redisClient.disconnect();
        } catch (e) {}
        redisClient = null;
      }
    });

    redisClient.on("ready", () => {
      console.log("🚀 Redis ready for caching");
    });

    return redisClient;
  } catch (error) {
    console.error("Failed to initialize Redis:", error.message);
    return null;
  }
};

const getRedisClient = () => {
  return redisClient;
};

const isRedisAvailable = () => {
  return redisClient !== null && redisClient.status === "ready";
};

module.exports = {
  connectRedis,
  getRedisClient,
  isRedisAvailable,
};
