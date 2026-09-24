const { AsyncLocalStorage } = require("async_hooks");
const requestContext = new AsyncLocalStorage();

const contextMiddleware = (req, res, next) => {
  const store = new Map();

  // Extract IP Address (handling standard proxy headers)
  let ipAddress =
    req.headers["x-forwarded-for"] ||
    req.ip ||
    req.socket.remoteAddress ||
    "";
  
  if (ipAddress.includes(",")) {
    ipAddress = ipAddress.split(",")[0].trim();
  }
  if (ipAddress.startsWith("::ffff:")) {
    ipAddress = ipAddress.split(":").pop();
  }
  if (ipAddress === "::1") {
    ipAddress = "127.0.0.1";
  }

  store.set("ipAddress", ipAddress);
  store.set("userAgent", req.headers["user-agent"] || "");
  store.set("userId", null); // Will be populated in auth middleware

  requestContext.run(store, () => {
    next();
  });
};

module.exports = {
  requestContext,
  contextMiddleware,
};
