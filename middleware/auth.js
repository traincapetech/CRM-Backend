const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Protect routes
const protect = async (req, res, next) => {
  let token;

  // Check for token in httpOnly cookie first (most secure)
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
    console.log("Auth middleware - Token found in cookie");
  }
  // Fallback: Check Authorization header (backward compatibility)
  else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
    console.log("Auth middleware - Token found in Authorization header");
  }

  // Make sure token exists
  if (!token) {
    console.log("Auth middleware - No token found");
    return res.status(401).json({
      success: false,
      message: "Not authorized to access this route",
    });
  }

  try {
    // SECURITY: Fail fast if JWT_SECRET is not configured
    if (!process.env.JWT_SECRET) {
      console.error("CRITICAL: JWT_SECRET environment variable is not set");
      return res.status(500).json({
        success: false,
        message: "Server configuration error",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Decoded token:", decoded);

    // Get user from token
    const user = await User.findById(decoded.id);
    console.log("Found user:", user ? user._id : "Not found");

    if (!user) {
      console.log("No user found with token ID");
      return res.status(401).json({
        success: false,
        message: "No user found with this token",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({
      success: false,
      message: "Not authorized to access this route",
    });
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    console.log("Authorize middleware - User role:", req.user.role);
    console.log("Authorize middleware - Allowed roles:", roles);

    if (!roles.includes(req.user.role)) {
      console.log("Role not authorized");
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };
