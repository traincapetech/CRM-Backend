const User = require("../models/User");
const bcrypt = require("bcrypt");

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
        message: "Email already registered",
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
      role,
    });

    sendTokenResponse(user, 201, res);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
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
        message: "Please provide an email and password",
      });
    }

    // Check for user
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }
    console.log(password);
    console.log(user.password);
    // Check if password matchesß
    // const isMatch = await user.matchPassword(password);
  
    // if (!isMatch) {
    //   console.log("Password is not matching");
    //   return res.status(401).json({
    //     success: false,
    //     message: "Invalid credentials",
    //   });
    // }

    bcrypt.compare(password, user.password, (err, result) => {
      if (err || !result) {
        return res
          .status(401)
          .send({ success: false, message: "Wrong Credentials" });
      }})

    sendTokenResponse(user, 200, res);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
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
    data: user,
  });
};

// @desc    Get all users for assignment
// @route   GET /api/auth/users
// @access  Private (only for Admin and Manager)
exports.getAllUsers = async (req, res) => {
  try {
    // Get the role filter from query params (if provided)
    const roleFilter = req.query.role || "";

    // Build the filter object
    const filter = {};
    if (roleFilter) {
      filter.role = roleFilter;
    }

    const users = await User.find(filter, "fullName email role");

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

// @desc    Update user
// @route   PUT /api/auth/users/:id
// @access  Private (Admin only)
exports.updateUser = async (req, res) => {
  try {
    console.log(`Attempting to update user with ID: ${req.params.id}`);
    const { fullName, email, role } = req.body;

    // Check if user exists
    let user = await User.findById(req.params.id);

    if (!user) {
      console.log(`User not found with ID: ${req.params.id}`);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update basic user data
    user.fullName = fullName || user.fullName;
    user.email = email || user.email;
    user.role = role || user.role;

    // If password is provided, update it
    if (req.body.password && req.body.password.trim() !== "") {
      user.password = req.body.password;
      // The password will be hashed via the pre-save middleware
    }

    // Save the user - this will trigger the pre-save hook for password hashing
    await user.save();

    // Make sure we don't return the password
    user = await User.findById(user._id);

    console.log(`User updated successfully: ${user._id}`);
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error(`Error updating user: ${err.message}`);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/auth/users/:id
// @access  Private (Admin only)
exports.deleteUser = async (req, res) => {
  try {
    console.log(`Attempting to delete user with ID: ${req.params.id}`);

    // Check if user exists
    const user = await User.findById(req.params.id);

    if (!user) {
      console.log(`User not found with ID: ${req.params.id}`);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user.id) {
      console.log("User attempted to delete their own account");
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    // Delete user with the findByIdAndDelete method
    const result = await User.findByIdAndDelete(req.params.id);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Failed to delete user",
      });
    }

    console.log(`User deleted successfully: ${req.params.id}`);
    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (err) {
    console.error(`Error deleting user: ${err.message}`);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

// @desc    Update profile picture
// @route   PUT /api/auth/profile-picture
// @access  Private
exports.updateProfilePicture = async (req, res) => {
  try {
    console.log('Profile picture update requested by user:', req.user.id);
    const { profilePicture } = req.body;
    
    if (!profilePicture) {
      console.log('No profile picture provided in request');
      return res.status(400).json({
        success: false,
        message: 'Please provide a profile picture URL'
      });
    }
    
    // Log the first 50 characters to avoid huge logs
    console.log('Received profile picture data (first 50 chars):', profilePicture.substring(0, 50) + '...');
    
    // Check if the request is a data URL (base64)
    if (profilePicture.startsWith('data:image')) {
      console.log('Processing base64 image data');
    } else {
      console.log('Received URL or other format:', profilePicture.substring(0, 50));
    }
    
    // Update the user's profile picture
    console.log('Updating user profile picture in database');
    const user = await User.findByIdAndUpdate(
      req.user.id, 
      { profilePicture },
      { new: true, runValidators: true }
    );
    
    if (!user) {
      console.log('User not found with ID:', req.user.id);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log('Profile picture updated successfully for user:', user._id);
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (err) {
    console.error(`Error updating profile picture: ${err.message}`);
    console.error('Stack trace:', err.stack);
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
    httpOnly: true,
  };

  if (process.env.NODE_ENV === "production") {
    options.secure = true;
  }

  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.fullName,
      email: user.email,
      role: user.role,
      profilePicture: user.profilePicture
    },
  });
};
