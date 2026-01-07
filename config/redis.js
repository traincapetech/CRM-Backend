/**
 * Redis Configuration
 * 
 * Provides Redis client for caching API responses and database queries
 */

const Redis = require('ioredis');

let redisClient = null;

const connectRedis = () => {
  // Only connect if REDIS_URL is provided
  if (!process.env.REDIS_URL) {
    console.log('ℹ️  Redis not configured - caching disabled');
    console.log('   To enable caching, set REDIS_URL in .env');
    return null;
  }

  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis connection error:', err.message);
      console.log('   Continuing without cache...');
    });

    redisClient.on('ready', () => {
      console.log('🚀 Redis ready for caching');
    });

    return redisClient;
  } catch (error) {
    console.error('Failed to initialize Redis:', error.message);
    return null;
  }
};

const getRedisClient = () => {
  return redisClient;
};

const isRedisAvailable = () => {
  return redisClient !== null && redisClient.status === 'ready';
};

module.exports = {
  connectRedis,
  getRedisClient,
  isRedisAvailable
};

