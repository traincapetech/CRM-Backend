const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes
exports.protect = async (req, res, next) => {
  let token;
  
  // Log all incoming requests with their paths and method
  console.log(`Auth middleware: ${req.method} ${req.originalUrl}`);

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    // Set token from Bearer token in header
    token = req.headers.authorization.split(' ')[1];
    console.log('Bearer token found in request');
  }

  // Make sure token exists
  if (!token) {
    console.log('No token found in request, rejecting with 401');
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route (no token provided)'
    });
  }

  try {
    // Verify token
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET environment variable is not defined');
      throw new Error('JWT_SECRET environment variable is not defined');
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(`Token verified for user ID: ${decoded.id}`);

    const user = await User.findById(decoded.id);
    
    if (!user) {
      console.log(`User not found with ID: ${decoded.id} from token`);
      return res.status(401).json({
        success: false,
        message: 'User not found or has been deleted'
      });
    }
    
    console.log(`User authenticated: ${user.fullName} (${user.role})`);
    req.user = user;
    next();
  } catch (err) {
    console.error('Token verification error:', err.message);
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    } else if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired, please log in again'
      });
    } else {
      return res.status(401).json({
        success: false,
        message: 'Authentication error: ' + err.message
      });
    }
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    console.log(`Role authorization check: User ${req.user.fullName} has role ${req.user.role}, required roles: ${roles.join(', ')}`);
    if (!roles.includes(req.user.role)) {
      console.log(`Access denied: ${req.user.role} not in [${roles.join(', ')}]`);
      return res.status(403).json({
        success: false,
        message: `Access denied: ${req.user.role} role is not authorized to perform this action`
      });
    }
    console.log('Role authorization successful');
    next();
  };
}; 