/**
 * Production-safe Logger Utility
 * Removes console.log statements in production environment
 * Usage: Replace console.log with logger.log, console.error with logger.error, etc.
 */

const isProduction = process.env.NODE_ENV === "production";

const logger = {
  // Regular logs - disabled in production
  log: (...args) => {
    if (!isProduction) {
      console.log(...args);
    }
  },

  // Debug logs - disabled in production
  debug: (...args) => {
    if (!isProduction) {
      console.debug(...args);
    }
  },

  // Info logs - disabled in production unless LOG_LEVEL=info
  info: (...args) => {
    if (
      !isProduction ||
      process.env.LOG_LEVEL === "info" ||
      process.env.LOG_LEVEL === "debug"
    ) {
      console.info(...args);
    }
  },

  // Warning logs - always enabled
  warn: (...args) => {
    console.warn(...args);
  },

  // Error logs - always enabled
  error: (...args) => {
    console.error(...args);
  },

  // Critical logs - always enabled with timestamp
  critical: (...args) => {
    console.error(`[CRITICAL ${new Date().toISOString()}]`, ...args);
  },
};

module.exports = logger;
