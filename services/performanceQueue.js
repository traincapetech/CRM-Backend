/**
 * Performance Queue Service
 *
 * Handles employee performance calculations in the background.
 * Uses Bull queue with Redis for background processing.
 */

let Queue = null;
try {
  Queue = require("bull");
} catch (error) {
  console.warn("⚠️ Bull queue library not installed. Run: npm install bull");
}

// Initialize queue with Redis connection
let performanceQueue = null;
let redisConnected = false;

const initPerformanceQueue = async () => {
  if (performanceQueue && redisConnected) return performanceQueue;
  if (!Queue) {
    console.warn("⚠️ Bull queue not available. Install with: npm install bull");
    return null;
  }

  // Check if REDIS_URL is configured
  if (!process.env.REDIS_URL) {
    console.warn(
      "⚠️ REDIS_URL not configured in .env. Performance queue will not be available.",
    );
    console.warn("⚠️ Falling back to synchronous performance calculation.");
    return null;
  }

  const redisUrl = process.env.REDIS_URL;
  const isRedisSsl = redisUrl.startsWith("rediss://");

  console.log(
    `📡 Connecting to Redis for Performance Queue (${isRedisSsl ? "SSL enabled" : "Non-SSL"})...`,
  );

  try {
    const queueOptions = {
      redis: redisUrl,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    };

    // Upstash/Secure Redis requires explicit TLS object
    if (isRedisSsl) {
      queueOptions.redis = {
        port: parseInt(new URL(redisUrl).port) || 6379,
        host: new URL(redisUrl).hostname,
        password: new URL(redisUrl).password,
        tls: {
          rejectUnauthorized: false, // Required for some managed Redis providers
        },
      };
    }

    performanceQueue = new Queue("performance-calculations", queueOptions);

    // Verify Redis connectivity with a ping before declaring ready
    try {
      const client = await performanceQueue.client;
      await client.ping();
      redisConnected = true;
      console.log("✅ Redis connection verified for performance queue");
    } catch (pingError) {
      console.error("❌ Redis ping failed for performance queue:", pingError.message);
      console.warn("⚠️ Falling back to synchronous performance calculation.");
      try {
        await performanceQueue.close();
      } catch (e) {
        // ignore close errors
      }
      performanceQueue = null;
      redisConnected = false;
      return null;
    }

    // Process calculations with concurrency level 2
    performanceQueue.process("calculate", 2, async (job) => {
      const { employeeId, date } = job.data;
      const PerformanceCalculationService = require("./performanceCalculation");
      
      try {
        const calcDate = date ? new Date(date) : new Date();
        await PerformanceCalculationService.calculateEmployeePerformance(employeeId, calcDate);
        return { success: true, employeeId, date };
      } catch (error) {
        console.error(`❌ Queue worker failed to calculate performance for ${employeeId}:`, error.message);
        throw error;
      }
    });

    // Event listeners
    performanceQueue.on("completed", (job, result) => {
      console.log(`✅ Performance calculation completed in background for employee ${result.employeeId}`);
    });

    performanceQueue.on("failed", (job, err) => {
      console.error(
        `❌ Performance job failed after ${job.attemptsMade} attempts:`,
        err.message,
      );
    });

    performanceQueue.on("error", (error) => {
      console.error("❌ Performance Queue Error:", error.message);
      redisConnected = false;
      if (
        error.message &&
        (error.message.includes("max requests limit exceeded") ||
          error.message.includes("ECONNREFUSED") ||
          error.message.includes("ENOTFOUND"))
      ) {
        console.error(
          "⚠️ Redis connection lost. Pausing performance queue.",
        );
        try {
          performanceQueue.pause();
          performanceQueue.close();
          performanceQueue = null;
          redisConnected = false;
        } catch (e) {
          console.error("Error closing performance queue:", e);
        }
      }
    });

    console.log("📊 Performance queue and workers initialized");
    return performanceQueue;
  } catch (error) {
    console.error("Failed to initialize performance queue:", error.message);
    performanceQueue = null;
    redisConnected = false;
    return null;
  }
};

/**
 * Queue a performance calculation or execute synchronously as fallback
 * @param {string} employeeId - Employee ID to calculate for
 * @param {Date|string} date - Date to calculate (default: today)
 */
const queuePerformanceCalculation = async (employeeId, date = new Date()) => {
  const dateKey = new Date(date).toISOString().split("T")[0];
  const jobId = `perf:${employeeId}:${dateKey}`;

  // Try to initialize queue if not already done
  if (!performanceQueue || !redisConnected) {
    await initPerformanceQueue();
  }

  // Fallback to sync if not available
  if (!performanceQueue || !Queue || !redisConnected) {
    const PerformanceCalculationService = require("./performanceCalculation");
    return await PerformanceCalculationService.calculateEmployeePerformance(employeeId, new Date(date));
  }

  // Verify connection
  try {
    const client = await performanceQueue.client;
    await client.ping();
  } catch (pingError) {
    console.error("❌ Redis ping failed before performance queueing:", pingError.message);
    redisConnected = false;
    performanceQueue = null;
    const PerformanceCalculationService = require("./performanceCalculation");
    return await PerformanceCalculationService.calculateEmployeePerformance(employeeId, new Date(date));
  }

  // Add job with 5 seconds delay for debouncing
  await performanceQueue.add(
    "calculate",
    { employeeId, date: new Date(date) },
    {
      delay: 5000,
      jobId,
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  return { queued: true, jobId };
};

module.exports = {
  initPerformanceQueue,
  queuePerformanceCalculation,
  getPerformanceQueue: () => performanceQueue,
};
