const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes
exports.protect = async (req, res, next) => {
  let token;
  
  // Only log in development environment
  if (process.env.NODE_ENV === 'development') {
    console.log('Auth middleware triggered');
    console.log('Headers:', req.headers);
  }

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    // Set token from Bearer token in header
    token = req.headers.authorization.split(' ')[1];
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Token extracted:', token ? 'Found' : 'Not found');
    }
  }

  // Make sure token exists
  if (!token) {
    if (process.env.NODE_ENV === 'development') {
      console.log('No token found in request');
    }
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  try {
    // Verify token
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is not defined');
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Token decoded:', decoded);
    }

    const user = await User.findById(decoded.id);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('User found:', user ? 'Yes' : 'No');
    }
    
    if (!user) {
      if (process.env.NODE_ENV === 'development') {
        console.log('No user found with the ID in the token');
      }
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }
    
    req.user = user;
    next();
  } catch (err) {
    console.error('Token verification error:', err.message);
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
}; 