const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes
const protect = async (req, res, next) => {
  let token;

  console.log('Auth middleware - Headers:', req.headers);

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
    console.log('Found token:', token);
  }

  // Make sure token exists
  if (!token) {
    console.log('No token found');
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  try {
    console.log('JWT Secret:', process.env.JWT_SECRET ? 'Set' : 'Not set');
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded);

    // Get user from token
    const user = await User.findById(decoded.id);
    console.log('Found user:', user ? user._id : 'Not found');

    if (!user) {
      console.log('No user found with token ID');
      return res.status(401).json({
        success: false,
        message: 'No user found with this token'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    console.log('Authorize middleware - User role:', req.user.role);
    console.log('Authorize middleware - Allowed roles:', roles);
    
    if (!roles.includes(req.user.role)) {
      console.log('Role not authorized');
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};

module.exports = { protect, authorize }; 