const User = require('../models/User');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // TEMPORARILY DISABLED FOR INITIAL SETUP
    // Uncomment this code after creating the first admin user
    /*
    // Prevent creating Admin users through public registration
    // Only allow Admin role if request comes from an existing Admin via the AdminUsersPage
    if (role === 'Admin') {
      // Check if this is from an authenticated admin user
      // The request might have auth info if it's from the admin user page
      const isAuthenticatedRequest = req.headers.authorization && 
                                    req.headers.authorization.startsWith('Bearer');
      
      if (!isAuthenticatedRequest) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: Cannot create admin user from public registration'
        });
      }
      
      // Further validation will be handled by middleware for admin endpoints
    }
    */

    // Create user
    const user = await User.create({
      fullName,
      email,
      password,
      role
    });

    sendTokenResponse(user, 201, res);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email and password'
      });
    }

    // Check for user
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user.id);

  res.status(200).json({
    success: true,
    data: user
  });
};

// @desc    Get all users for assignment
// @route   GET /api/auth/users
// @access  Private (only for Admin and Manager)
exports.getAllUsers = async (req, res) => {
  try {
    // Get the role filter from query params (if provided)
    const roleFilter = req.query.role || '';
    
    // Build the filter object
    const filter = {};
    if (roleFilter) {
      filter.role = roleFilter;
    }
    
    const users = await User.find(filter, 'fullName email role');
    
    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  // Create token
  const token = user.getSignedJwtToken();

  const options = {
    expires: new Date(
      Date.now() + (process.env.JWT_COOKIE_EXPIRE || 30) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true
  };

  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }

  res
    .status(statusCode)
    .json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.fullName,
        email: user.email,
        role: user.role
      }
    });
}; 