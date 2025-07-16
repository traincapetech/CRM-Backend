const User = require("../models/User");
const bcrypt = require("bcrypt");
const fs = require('fs'); // Added for file cleanup

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    console.log("Register attempt:", { 
      email: req.body.email,
      fullName: req.body.fullName,
      role: req.body.role 
    });
    
    const { fullName, email, password, role } = req.body;
    
    // Basic validation
    if (!fullName || !email || !password) {
      console.log("Missing required registration fields");
      return res.status(400).json({
        success: false,
        message: "Please provide name, email and password"
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      console.log(`User with email ${email} already exists`);
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    console.log("Creating new user...");
    // Create user
    const user = await User.create({
      fullName,
      email,
      password,
      role: role || 'Sales Person', // Default role if not specified
    });

    console.log(`User created successfully with ID: ${user._id}`);
    sendTokenResponse(user, 201, res);
  } catch (err) {
    console.error("Registration error details:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code
    });
    
    // Provide more specific error messages for common issues
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }
    
    res.status(500).json({
      success: false,
      message: err.message || 'Internal server error during registration'
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    console.log("Login attempt:", { email: req.body.email });
    const { email, password } = req.body;

    // Validate email & password
    if (!email || !password) {
      console.log("Missing credentials - email or password not provided");
      return res.status(400).json({
        success: false,
        message: "Please provide an email and password",
      });
    }

    // Check for user and explicitly select password field
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      console.log(`User not found with email: ${email}`);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }
    
    console.log(`User found: ${user._id}, comparing passwords`);
    
    // Use the matchPassword method from the User model
    const isMatch = await user.matchPassword(password);
    
    if (!isMatch) {
      console.log("Password does not match");
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }
    
    console.log("Login successful, sending token response");
    sendTokenResponse(user, 200, res);
  } catch (err) {
    console.error("Login error:", {
      name: err.name,
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({
      success: false,
      message: "An error occurred during login. Please try again.",
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
// @access  Private (Admin and Manager, but Manager cannot modify Admin accounts)
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

    // Prevent Managers from modifying Admin accounts
    if (req.user.role === 'Manager' && user.role === 'Admin') {
      return res.status(403).json({
        success: false,
        message: "Managers cannot modify Admin accounts",
      });
    }

    // Prevent Managers from creating new Admin accounts
    if (req.user.role === 'Manager' && role === 'Admin') {
      return res.status(403).json({
        success: false,
        message: "Managers cannot create Admin accounts",
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
// @access  Private (Admin and Manager, but Manager cannot delete Admin accounts)
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

    // Prevent user from deleting themselves
    if (user._id.toString() === req.user.id) {
      console.log("User attempted to delete their own account");
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    // Prevent Managers from deleting Admin accounts
    if (req.user.role === 'Manager' && user.role === 'Admin') {
      return res.status(403).json({
        success: false,
        message: "Managers cannot delete Admin accounts",
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
    console.log('Request files:', req.files);
    console.log('Request body:', req.body);
    
    // Check if a file was uploaded
    if (!req.files || !req.files.profilePicture) {
      console.log('No profile picture file provided in request');
      return res.status(400).json({
        success: false,
        message: 'Please provide a profile picture file'
      });
    }
    
    const profilePictureFile = req.files.profilePicture[0];
    console.log('Received profile picture file:', profilePictureFile.filename);
    
    // Store the file path in the database
    const profilePicturePath = `/uploads/profile-pictures/${profilePictureFile.filename}`;
    
    // Update the user's profile picture
    console.log('Updating user profile picture in database');
    const user = await User.findByIdAndUpdate(
      req.user.id, 
      { profilePicture: profilePicturePath },
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
      data: user,
      profilePicture: profilePicturePath
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

// @desc    Create new user (for Admin and Manager)
// @route   POST /api/auth/users
// @access  Private (Admin and Manager, but Manager cannot create Admin accounts)
exports.createUser = async (req, res) => {
  try {
    console.log("Create user attempt by:", req.user.role, "for:", req.body);
    const { fullName, email, password, role } = req.body;
    
    // Basic validation
    if (!fullName || !email || !password) {
      console.log("Missing required fields for user creation");
      return res.status(400).json({
        success: false,
        message: "Please provide name, email and password"
      });
    }

    // Prevent Managers from creating Admin accounts
    if (req.user.role === 'Manager' && role === 'Admin') {
      return res.status(403).json({
        success: false,
        message: "Managers cannot create Admin accounts",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      console.log(`User with email ${email} already exists`);
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    console.log("Creating new user...");
    // Create user
    const user = await User.create({
      fullName,
      email,
      password,
      role: role || 'Sales Person', // Default role if not specified
    });

    console.log(`User created successfully with ID: ${user._id}`);
    
    // Return user data without password
    const userData = await User.findById(user._id);
    
    res.status(201).json({
      success: true,
      data: userData,
    });
  } catch (err) {
    console.error("User creation error details:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code
    });
    
    // Provide more specific error messages for common issues
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }
    
    res.status(500).json({
      success: false,
      message: err.message || 'Internal server error during user creation'
    });
  }
};

// @desc    Create new user with documents (for Admin and Manager)
// @route   POST /api/auth/users/with-documents
// @access  Private (Admin and Manager, but Manager cannot create Admin accounts)
exports.createUserWithDocuments = async (req, res) => {
  try {
    console.log("Create user with documents attempt by:", req.user.role);
    console.log("Request body:", req.body);
    console.log("Request files:", req.files ? Object.keys(req.files) : 'No files');
    
    const { fullName, email, password, role } = req.body;
    
    // Basic validation
    if (!fullName || !email || !password) {
      console.log("Missing required fields for user creation");
      return res.status(400).json({
        success: false,
        message: "Please provide name, email and password"
      });
    }

    // Prevent Managers from creating Admin accounts
    if (req.user.role === 'Manager' && role === 'Admin') {
      return res.status(403).json({
        success: false,
        message: "Managers cannot create Admin accounts",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      console.log(`User with email ${email} already exists`);
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Create user
    let user;
    try {
      console.log("Creating new user...");
      user = await User.create({
        fullName,
        email,
        password,
        role: role || 'Sales Person', // Default role if not specified
      });
      console.log(`User created successfully with ID: ${user._id}`);
    } catch (userError) {
      console.error("Error creating user:", userError);
      throw userError;
    }
    
    // Handle employee creation for non-admin/non-hr roles
    if (['Sales Person', 'Lead Person', 'Manager', 'Employee'].includes(role)) {
      try {
        const Employee = require('../models/Employee');
        const Department = require('../models/Department');
        const Role = require('../models/EmployeeRole');
        
        // Find or create department
        let department = await Department.findOne({ name: 'General' });
        if (!department) {
          department = await Department.create({
            name: 'General',
            description: 'General Department for all employees'
          });
        }
        
        // Find or create role
        let employeeRole = await Role.findOne({ name: role });
        if (!employeeRole) {
          employeeRole = await Role.create({
            name: role,
            description: `Role for ${role}`
          });
        }
        
        // Create employee record
        const employeeData = {
          fullName,
          email,
          userId: user._id,
          role: employeeRole._id,
          department: department._id,
          
          // Add all the new fields from the admin form
          phoneNumber: req.body.phoneNumber || '',
          whatsappNumber: req.body.whatsappNumber || '',
          linkedInUrl: req.body.linkedInUrl || '',
          currentAddress: req.body.currentAddress || '',
          permanentAddress: req.body.permanentAddress || '',
          dateOfBirth: req.body.dateOfBirth || null,
          joiningDate: req.body.joiningDate || new Date(),
          salary: req.body.salary ? parseFloat(req.body.salary) : 0,
          status: req.body.status || 'ACTIVE',
          collegeName: req.body.collegeName || '',
          internshipDuration: req.body.internshipDuration ? parseInt(req.body.internshipDuration) : null,
          
          // Initialize documents object
          documents: {}
        };
        
        // Process uploaded documents
        if (req.files) {
          const documentTypes = ['photograph', 'tenthMarksheet', 'twelfthMarksheet', 'bachelorDegree', 'postgraduateDegree', 'aadharCard', 'panCard', 'pcc', 'resume', 'offerLetter'];
          
          for (const docType of documentTypes) {
            if (req.files[docType] && req.files[docType][0]) {
              const file = req.files[docType][0];
              try {
                // Ensure the file was saved successfully
                if (!fs.existsSync(file.path)) {
                  console.error(`File not saved: ${file.path}`);
                  continue;
                }
                
                employeeData.documents[docType] = {
                  filename: file.filename,
                  originalName: file.originalname,
                  path: file.path,
                  mimetype: file.mimetype,
                  size: file.size,
                  uploadedAt: new Date()
                };
              } catch (fileError) {
                console.error(`Error processing file ${docType}:`, fileError);
                // Continue with other files if one fails
              }
            }
          }
        }
        
        const employee = await Employee.create(employeeData);
        console.log(`Employee created successfully with ID: ${employee._id}`);
      } catch (employeeError) {
        console.error("Error creating employee record:", employeeError);
        // If employee creation fails, delete the user and throw error
        await User.findByIdAndDelete(user._id);
        throw new Error(`Failed to create employee record: ${employeeError.message}`);
      }
    }
    
    // Return user data without password
    const userData = await User.findById(user._id);
    
    res.status(201).json({
      success: true,
      data: userData,
    });
  } catch (err) {
    console.error("User creation with documents error details:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code
    });
    
    // Clean up any uploaded files if there was an error
    if (req.files) {
      Object.values(req.files).forEach(fileArray => {
        fileArray.forEach(file => {
          try {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
              console.log(`Cleaned up file: ${file.path}`);
            }
          } catch (cleanupError) {
            console.error(`Error cleaning up file ${file.path}:`, cleanupError);
          }
        });
      });
    }
    
    // Provide more specific error messages for common issues
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }
    
    res.status(500).json({
      success: false,
      message: err.message || 'Internal server error during user creation'
    });
  }
};

// @desc    Update user with documents
// @route   PUT /api/auth/users/:id/with-documents
// @access  Private (Admin and Manager, but Manager cannot modify Admin accounts)
exports.updateUserWithDocuments = async (req, res) => {
  try {
    console.log(`Attempting to update user with documents, ID: ${req.params.id}`);
    console.log('Request body:', req.body);
    console.log('Request files:', req.files ? Object.keys(req.files) : 'No files');
    
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

    // Prevent Managers from modifying Admin accounts
    if (req.user.role === 'Manager' && user.role === 'Admin') {
      return res.status(403).json({
        success: false,
        message: "Managers cannot modify Admin accounts",
      });
    }

    // Prevent Managers from making users Admin
    if (req.user.role === 'Manager' && role === 'Admin') {
      return res.status(403).json({
        success: false,
        message: "Managers cannot create Admin accounts",
      });
    }

    // Update user fields - only update provided fields
    const updateData = {};
    if (fullName && fullName.trim() !== '') updateData.fullName = fullName;
    if (email && email.trim() !== '') updateData.email = email;
    if (role && role.trim() !== '') updateData.role = role;

    // Handle password update if provided
    if (req.body.password && req.body.password.trim() !== '') {
      updateData.password = req.body.password;
    }
    
    // Ensure we have at least some data to update
    if (Object.keys(updateData).length === 0 && (!req.files || Object.keys(req.files).length === 0)) {
      return res.status(400).json({
        success: false,
        message: "No data provided for update"
      });
    }

    // Update user only if there's data to update
    if (Object.keys(updateData).length > 0) {
      user = await User.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true,
      });
    }

    console.log(`User updated successfully: ${user._id}`);
    
    // Handle employee update for non-admin/non-hr roles
    const userRole = updateData.role || user.role;
    if (['Sales Person', 'Lead Person', 'Manager', 'Employee'].includes(userRole)) {
      const Employee = require('../models/Employee');
      const Department = require('../models/Department');
      const Role = require('../models/EmployeeRole');
      
      // Find or create employee record
      let employee = await Employee.findOne({ userId: user._id });
      
      if (!employee) {
        // Find or create department
        let department = await Department.findOne({ name: 'General' });
        if (!department) {
          department = await Department.create({
            name: 'General',
            description: 'General Department for all employees'
          });
        }
        
        // Find or create role for the current user role
        let employeeRole = await Role.findOne({ name: userRole });
        if (!employeeRole) {
          employeeRole = await Role.create({
            name: userRole,
            description: `Role for ${userRole}`
          });
        }
        
        // Create new employee if doesn't exist
        employee = await Employee.create({
          fullName: user.fullName,
          email: user.email,
          userId: user._id,
          role: employeeRole._id,
          department: department._id,
          documents: {}
        });
      }
      
      // Update employee basic info with new values
      if (updateData.fullName) employee.fullName = updateData.fullName;
      if (updateData.email) employee.email = updateData.email;
      
      // Update employee role if user role changed
      if (updateData.role) {
        // Find or create role for the new role
        let newEmployeeRole = await Role.findOne({ name: updateData.role });
        if (!newEmployeeRole) {
          newEmployeeRole = await Role.create({
            name: updateData.role,
            description: `Role for ${updateData.role}`
          });
        }
        employee.role = newEmployeeRole._id;
      }
      
      // Update all employee fields from form
      if (req.body.phoneNumber !== undefined) employee.phoneNumber = req.body.phoneNumber;
      if (req.body.whatsappNumber !== undefined) employee.whatsappNumber = req.body.whatsappNumber;
      if (req.body.linkedInUrl !== undefined) employee.linkedInUrl = req.body.linkedInUrl;
      if (req.body.currentAddress !== undefined) employee.currentAddress = req.body.currentAddress;
      if (req.body.permanentAddress !== undefined) employee.permanentAddress = req.body.permanentAddress;
      if (req.body.dateOfBirth !== undefined) employee.dateOfBirth = req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : null;
      if (req.body.joiningDate !== undefined) employee.joiningDate = req.body.joiningDate ? new Date(req.body.joiningDate) : null;
      if (req.body.salary !== undefined) employee.salary = req.body.salary ? parseFloat(req.body.salary) : 0;
      if (req.body.status !== undefined) employee.status = req.body.status;
      if (req.body.collegeName !== undefined) employee.collegeName = req.body.collegeName;
      if (req.body.internshipDuration !== undefined) employee.internshipDuration = req.body.internshipDuration ? parseInt(req.body.internshipDuration) : null;
      
      // Update department if provided
      if (req.body.department !== undefined && req.body.department !== '') {
        const department = await Department.findById(req.body.department);
        if (department) {
          employee.department = department._id;
        }
      }
      
      // Update employee role if provided
      if (req.body.employeeRole !== undefined && req.body.employeeRole !== '') {
        const employeeRole = await Role.findById(req.body.employeeRole);
        if (employeeRole) {
          employee.role = employeeRole._id;
        }
      }
      
      // Process uploaded documents if any
      if (req.files) {
        if (!employee.documents) {
          employee.documents = {};
        }
        
        const documentTypes = ['photograph', 'tenthMarksheet', 'twelfthMarksheet', 'bachelorDegree', 'postgraduateDegree', 'aadharCard', 'panCard', 'pcc', 'resume', 'offerLetter'];
        
        for (const docType of documentTypes) {
          if (req.files[docType]) {
            const file = req.files[docType][0];
            employee.documents[docType] = {
              filename: file.filename, // Use the generated filename, not originalname
              originalName: file.originalname, // Store original name separately
              path: file.path,
              mimetype: file.mimetype,
              size: file.size,
              uploadedAt: new Date()
            };
          }
        }
      }
      
      await employee.save();
      console.log(`Employee updated successfully with ID: ${employee._id}`);
    } else {
      console.log(`User role ${userRole} does not require employee record`);
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error(`Error updating user with documents: ${err.message}`);
    res.status(400).json({
      success: false,
      message: err.message,
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
