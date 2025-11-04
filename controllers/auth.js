const User = require("../models/User");
const bcrypt = require("bcrypt");
const fs = require('fs'); // Added for file cleanup
const path = require('path'); // Added for path.join
const { UPLOAD_PATHS } = require('../config/storage');
const { sendEmail } = require('../config/nodemailer');
const asyncHandler = require('../middleware/async'); // Added for asyncHandler

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
    const { email, password } = req.body;

    // Normalize email to lowercase for case-insensitive search
    const normalizedEmail = email ? email.toLowerCase().trim() : '';

    console.log('Login attempt for:', normalizedEmail);
    console.log('Original email provided:', email);

    // Validate email & password
    if (!normalizedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Check for user and explicitly select password field (case-insensitive)
    // Try exact match first, then lowercase match
    let user = await User.findOne({ email: normalizedEmail }).select('+password -__v');
    
    // If not found, try case-insensitive search
    if (!user) {
      user = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } }).select('+password -__v');
    }
    
    console.log('Found user:', user ? {
      id: user._id,
      email: user.email,
      role: user.role,
      active: user.active
    } : 'Not found');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user account is active
    if (user.active === false) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact your administrator.'
      });
    }

    // Check if user is an IT Intern and internship has expired
    if (user.role === 'IT Intern') {
      const Employee = require('../models/Employee');
      const employee = await Employee.findOne({ userId: user._id });
      
      if (employee && employee.internshipEndDate) {
        const today = new Date();
        const endDate = new Date(employee.internshipEndDate);
        today.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);
        
        if (today > endDate) {
          // Auto-deactivate account if internship expired
          user.active = false;
          await user.save();
          
          return res.status(403).json({
            success: false,
            message: 'Your internship has ended. Your account has been deactivated. Please contact your administrator.'
          });
        }
      }
    }

    // Check if password matches
    console.log('=== PASSWORD VERIFICATION ===');
    console.log('User ID:', user._id.toString());
    console.log('Email:', user.email);
    console.log('Role:', user.role);
    console.log('Active:', user.active);
    console.log('Password provided:', password ? 'Yes (length: ' + password.length + ')' : 'No');
    console.log('Stored password hash exists:', !!user.password);
    console.log('Stored password hash length:', user.password ? user.password.length : 0);
    
    const isMatch = await user.matchPassword(password);
    console.log('Password match result:', isMatch);
    console.log('=== END PASSWORD VERIFICATION ===');

    if (!isMatch) {
      console.log('❌ LOGIN FAILED: Password mismatch for user:', {
        id: user._id.toString(),
        email: user.email,
        role: user.role
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    console.log('✅ LOGIN SUCCESS: Password matched for user:', {
      id: user._id.toString(),
      email: user.email,
      role: user.role
    });

    // Create token
    const token = user.getSignedJwtToken();
    console.log('Generated token:', token);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    
    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      return res.status(500).json({
        success: false,
        message: 'Database error',
        error: 'Please try again later'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error logging in. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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
// @access  Private (Admin, Manager, Sales Person, Lead Person)
exports.getAllUsers = async (req, res) => {
  try {
    // Get the role filter from query params (if provided). Support multiple roles.
    const roleParam = req.query.role || "";

    const filter = {};
    if (roleParam) {
      if (Array.isArray(roleParam)) {
        // ?role=A&role=B
        filter.role = { $in: roleParam.filter(Boolean) };
      } else if (typeof roleParam === 'string' && roleParam.includes(',')) {
        // ?role=A,B
        filter.role = { $in: roleParam.split(',').map(r => r.trim()).filter(Boolean) };
      } else {
        // single role string
        filter.role = roleParam;
      }
    }

    const users = await User.find(filter).select("fullName email role createdAt active");

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

    // Delete associated employee record if it exists
    const Employee = require('../models/Employee');
    const employee = await Employee.findOne({ userId: req.params.id });
    if (employee) {
      console.log(`Deleting associated employee record: ${employee._id}`);
      await Employee.findByIdAndDelete(employee._id);
    }

    // Delete user with the findByIdAndDelete method
    const result = await User.findByIdAndDelete(req.params.id);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Failed to delete user",
      });
    }

    console.log(`User and associated employee deleted successfully: ${req.params.id}`);
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

// @desc    Toggle user active status
// @route   PUT /api/auth/users/:id/toggle-active
// @access  Private (Admin and IT Manager)
exports.toggleUserActive = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent toggling own account
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own account",
      });
    }

    // Prevent IT Manager from toggling Admin or other IT Manager accounts
    if (req.user.role === 'IT Manager' && (user.role === 'Admin' || user.role === 'IT Manager')) {
      return res.status(403).json({
        success: false,
        message: "IT Managers cannot modify Admin or other IT Manager accounts",
      });
    }

    // Toggle active status
    user.active = !user.active;
    await user.save();

    res.status(200).json({
      success: true,
      data: user,
      message: `User ${user.active ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (err) {
    console.error(`Error toggling user active status: ${err.message}`);
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
    
    // Store the file path in the database using the new UPLOAD_PATHS
    const profilePicturePath = path.join(UPLOAD_PATHS.PROFILE_PICTURES, profilePictureFile.filename);
    
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
      return res.status(403).json({ success: false, message: "Managers cannot create Admin accounts" });
    }

    // IT Manager restriction (cannot create Admin/IT Manager)
    if (req.user.role === 'IT Manager' && (role === 'Admin' || role === 'IT Manager')) {
      return res.status(403).json({ success: false, message: "IT Managers cannot create Admin or other IT Manager accounts" });
    }

    if (req.user.role === 'IT Manager' && !['IT Intern', 'IT Permanent'].includes(role)) {
      return res.status(403).json({ success: false, message: "IT Managers can only create IT Interns and Permanent IT staff." });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    // Documents are now optional - users can be created without documents
    // Documents will be processed if provided, but are not required

    // Create user
    let user;
    try {
      user = await User.create({ fullName, email, password, role: role || 'Sales Person' });
    } catch (userError) {
      console.error("Error creating user:", userError);
      throw userError;
    }
    
    // Handle employee creation for roles
    if (['Sales Person', 'Lead Person', 'Manager', 'Employee', 'IT Manager', 'IT Intern', 'IT Permanent'].includes(role)) {
      try {
        const Employee = require('../models/Employee');
        const Department = require('../models/Department');
        const Role = require('../models/EmployeeRole');

        // Department: IT for IT roles, else General
        let department;
        if (['IT Manager', 'IT Intern', 'IT Permanent'].includes(role)) {
          department = await Department.findOne({ name: 'IT' }) || await Department.create({ name: 'IT', description: 'IT Department' });
        } else {
          department = await Department.findOne({ name: 'General' }) || await Department.create({ name: 'General', description: 'General Department for all employees' });
        }

        // Employee Role
        let employeeRole = await Role.findOne({ name: role }) || await Role.create({ name: role, description: `Role for ${role}` });

        // Build employee payload
        const employeeData = {
          fullName,
          email,
          userId: user._id,
          role: employeeRole._id,
          department: department._id,
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
        };

        // Set employmentType for IT roles
        if (role === 'IT Intern') {
          employeeData.employmentType = 'INTERN';
          // Handle internship dates
          if (req.body.internshipStartDate) {
            employeeData.internshipStartDate = new Date(req.body.internshipStartDate);
          }
          if (req.body.internshipEndDate) {
            employeeData.internshipEndDate = new Date(req.body.internshipEndDate);
          }
        } else if (role === 'IT Permanent') {
          employeeData.employmentType = 'PERMANENT';
        }

        // Handle skills field (comma-separated string to array)
        if (req.body.skills) {
          const skillsStr = typeof req.body.skills === 'string' ? req.body.skills : '';
          employeeData.skills = skillsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
        }

        // Process uploaded documents using file storage service
        if (req.files) {
          const documentTypes = ['photograph','tenthMarksheet','twelfthMarksheet','bachelorDegree','postgraduateDegree','aadharCard','panCard','pcc','resume','offerLetter'];
          employeeData.documents = {}; // Initialize documents object
          for (const docType of documentTypes) {
            if (req.files[docType] && req.files[docType][0]) {
              const file = req.files[docType][0];
              try {
                const fileStorage = require('../services/fileStorageService');
                const uploaded = await fileStorage.uploadEmployeeDoc(file, docType);
                // Store in both individual field and documents object for consistency
                employeeData[docType] = uploaded;
                employeeData.documents[docType] = uploaded;
              } catch (fileError) {
                console.error(`Error processing file ${docType}:`, fileError);
              }
            }
          }
        }

        await Employee.create(employeeData);
      } catch (employeeError) {
        await User.findByIdAndDelete(user._id);
        throw new Error(`Failed to create employee record: ${employeeError.message}`);
      }
    }

    const userData = await User.findById(user._id);
    return res.status(201).json({ success: true, data: userData, message: 'User created successfully with documents' });
  } catch (err) {
    console.error("User creation with documents error details:", { name: err.name, message: err.message, stack: err.stack, code: err.code });
    return res.status(500).json({ success: false, message: err.message || 'Internal server error during user creation' });
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
    
    // Validate required parameters
    if (!req.params.id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }
    
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
    if (email && email.trim() !== '') updateData.email = email.toLowerCase().trim();
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
    if (['Sales Person', 'Lead Person', 'Manager', 'Employee', 'IT Manager', 'IT Intern', 'IT Permanent'].includes(userRole)) {
      const Employee = require('../models/Employee');
      const Department = require('../models/Department');
      const Role = require('../models/EmployeeRole');
      
      console.log(`Looking for employee record for user: ${user._id}, role: ${userRole}`);
      
      // Debug: Check what employees exist with this email
      const allEmployeesWithEmail = await Employee.find({ email: user.email });
      console.log(`All employees with email ${user.email}:`, allEmployeesWithEmail.map(emp => ({
        id: emp._id,
        userId: emp.userId,
        fullName: emp.fullName,
        email: emp.email
      })));
      
      // Find or create employee record - try multiple search criteria
      let employee = await Employee.findOne({ userId: user._id });
      
      // If not found by userId, try by email
      if (!employee) {
        console.log(`Employee not found by userId, trying by email: ${user.email}`);
        employee = await Employee.findOne({ email: user.email });
      }
      
      console.log(`Employee lookup result:`, {
        found: !!employee,
        employeeId: employee?._id,
        employeeUserId: employee?.userId,
        employeeEmail: employee?.email,
        searchUserId: user._id,
        searchEmail: user.email
      });
      
      if (!employee) {
        console.log('No employee record found, creating new one...');
        
        // Double-check: Make sure no employee exists with this email
        const existingEmployeeByEmail = await Employee.findOne({ email: user.email });
        if (existingEmployeeByEmail) {
          console.log(`Found existing employee by email, updating userId instead of creating new one`);
          employee = existingEmployeeByEmail;
          // Update the userId to link it to this user
          employee.userId = user._id;
          await employee.save();
        } else {
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
          const employeeData = {
            fullName: user.fullName,
            email: user.email,
            userId: user._id,
            role: employeeRole._id,
            department: department._id
          };
          
          // Set employmentType for IT roles
          if (userRole === 'IT Intern') {
            employeeData.employmentType = 'INTERN';
          } else if (userRole === 'IT Permanent') {
            employeeData.employmentType = 'PERMANENT';
          }
          
          employee = await Employee.create(employeeData);
          console.log(`Created new employee record: ${employee._id}`);
        }
      } else {
        console.log(`Found existing employee record: ${employee._id}`);
        // Update the userId if it's missing or different
        if (!employee.userId || employee.userId.toString() !== user._id.toString()) {
          console.log(`Updating employee userId from ${employee.userId} to ${user._id}`);
          employee.userId = user._id;
        }
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
        
        // Update employmentType for IT roles
        if (updateData.role === 'IT Intern') {
          employee.employmentType = 'INTERN';
        } else if (updateData.role === 'IT Permanent') {
          employee.employmentType = 'PERMANENT';
        }
      }
      
      // Also check current role for employmentType if not set
      const currentRole = updateData.role || userRole;
      if (!employee.employmentType && currentRole === 'IT Intern') {
        employee.employmentType = 'INTERN';
      } else if (!employee.employmentType && currentRole === 'IT Permanent') {
        employee.employmentType = 'PERMANENT';
      }
      
      // Handle internship dates for IT Intern
      if (req.body.internshipStartDate !== undefined && req.body.internshipStartDate !== '') {
        employee.internshipStartDate = new Date(req.body.internshipStartDate);
      }
      if (req.body.internshipEndDate !== undefined && req.body.internshipEndDate !== '') {
        employee.internshipEndDate = new Date(req.body.internshipEndDate);
      }
      // Allow clearing dates if empty string is sent
      if (req.body.internshipStartDate === '') {
        employee.internshipStartDate = null;
      }
      if (req.body.internshipEndDate === '') {
        employee.internshipEndDate = null;
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
      
      // Update skills if provided
      if (req.body.skills !== undefined) {
        employee.skills = req.body.skills ? req.body.skills.split(',').map(skill => skill.trim()) : [];
      }

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
      
      // Process uploaded documents using file storage service
      if (req.files) {
        console.log('Processing file uploads in update auth controller:', Object.keys(req.files));
        const documentTypes = ['photograph', 'tenthMarksheet', 'twelfthMarksheet', 'bachelorDegree', 'postgraduateDegree', 'aadharCard', 'panCard', 'pcc', 'resume', 'offerLetter'];
        
        for (const docType of documentTypes) {
          if (req.files[docType] && req.files[docType][0]) {
            const file = req.files[docType][0];
            console.log(`Processing file ${docType} for update:`, {
              originalName: file.originalname,
              filename: file.filename,
              mimetype: file.mimetype,
              size: file.size,
              path: file.path
            });
            
            try {
              const fileStorage = require('../services/fileStorageService');
              console.log(`Calling fileStorage.uploadEmployeeDoc for ${docType}...`);
              const uploaded = await fileStorage.uploadEmployeeDoc(file, docType);
              console.log(`File ${docType} uploaded successfully for update:`, uploaded);
              
              // Store the uploaded file info directly in employee data
              employee[docType] = uploaded;
              console.log(`Stored ${docType} in employee record:`, employee[docType]);
            } catch (fileError) {
              console.error(`Error processing file ${docType} for update:`, fileError);
              console.error(`File error details:`, {
                message: fileError.message,
                stack: fileError.stack
              });
              // Continue with other files if one fails
            }
          }
        }
      } else {
        console.log('No files found in update auth controller request');
      }
      
      console.log('About to save employee with documents:', {
        employeeId: employee._id,
        documents: {
          photograph: !!employee.photograph,
          tenthMarksheet: !!employee.tenthMarksheet,
          aadharCard: !!employee.aadharCard,
          panCard: !!employee.panCard,
          pcc: !!employee.pcc,
          resume: !!employee.resume,
          offerLetter: !!employee.offerLetter
        }
      });
      
      // Use findByIdAndUpdate instead of save() to ensure proper update
      const employeeUpdateData = {};
      
      // Add all the updated fields
      if (employee.fullName) employeeUpdateData.fullName = employee.fullName;
      if (employee.email) employeeUpdateData.email = employee.email;
      if (req.body.phoneNumber !== undefined) employeeUpdateData.phoneNumber = req.body.phoneNumber;
      if (req.body.whatsappNumber !== undefined) employeeUpdateData.whatsappNumber = req.body.whatsappNumber;
      if (req.body.linkedInUrl !== undefined) employeeUpdateData.linkedInUrl = req.body.linkedInUrl;
      if (req.body.currentAddress !== undefined) employeeUpdateData.currentAddress = req.body.currentAddress;
      if (req.body.permanentAddress !== undefined) employeeUpdateData.permanentAddress = req.body.permanentAddress;
      if (req.body.dateOfBirth !== undefined) employeeUpdateData.dateOfBirth = req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : null;
      if (req.body.joiningDate !== undefined) employeeUpdateData.joiningDate = req.body.joiningDate ? new Date(req.body.joiningDate) : null;
      if (req.body.salary !== undefined) employeeUpdateData.salary = req.body.salary ? parseFloat(req.body.salary) : 0;
      if (req.body.status !== undefined) employeeUpdateData.status = req.body.status;
      if (req.body.collegeName !== undefined) employeeUpdateData.collegeName = req.body.collegeName;
      if (req.body.internshipDuration !== undefined) employeeUpdateData.internshipDuration = req.body.internshipDuration ? parseInt(req.body.internshipDuration) : null;
      
      // Add internship dates
      if (req.body.internshipStartDate !== undefined) {
        employeeUpdateData.internshipStartDate = req.body.internshipStartDate ? new Date(req.body.internshipStartDate) : null;
      }
      if (req.body.internshipEndDate !== undefined) {
        employeeUpdateData.internshipEndDate = req.body.internshipEndDate ? new Date(req.body.internshipEndDate) : null;
      }
      
      // Add skills
      if (req.body.skills !== undefined) {
        employeeUpdateData.skills = req.body.skills ? req.body.skills.split(',').map(skill => skill.trim()).filter(skill => skill.length > 0) : [];
      }
      
      // Ensure employmentType is set correctly
      if (employee.employmentType) {
        employeeUpdateData.employmentType = employee.employmentType;
      }
      
      // Add document fields
      if (employee.photograph) employeeUpdateData.photograph = employee.photograph;
      if (employee.tenthMarksheet) employeeUpdateData.tenthMarksheet = employee.tenthMarksheet;
      if (employee.twelfthMarksheet) employeeUpdateData.twelfthMarksheet = employee.twelfthMarksheet;
      if (employee.bachelorDegree) employeeUpdateData.bachelorDegree = employee.bachelorDegree;
      if (employee.postgraduateDegree) employeeUpdateData.postgraduateDegree = employee.postgraduateDegree;
      if (employee.aadharCard) employeeUpdateData.aadharCard = employee.aadharCard;
      if (employee.panCard) employeeUpdateData.panCard = employee.panCard;
      if (employee.pcc) employeeUpdateData.pcc = employee.pcc;
      if (employee.resume) employeeUpdateData.resume = employee.resume;
      if (employee.offerLetter) employeeUpdateData.offerLetter = employee.offerLetter;
      
      console.log('Update data for employee:', employeeUpdateData);
      
      employee = await Employee.findByIdAndUpdate(employee._id, employeeUpdateData, {
        new: true,
        runValidators: true
      });
      
      console.log(`Employee updated successfully with ID: ${employee._id}`);
      
      // Verify the saved employee data
      const savedEmployee = await Employee.findById(employee._id);
      console.log('Saved employee verification:', {
        employeeId: savedEmployee._id,
        documents: {
          photograph: !!savedEmployee.photograph,
          tenthMarksheet: !!savedEmployee.tenthMarksheet,
          aadharCard: !!savedEmployee.aadharCard,
          panCard: !!savedEmployee.panCard,
          pcc: !!savedEmployee.pcc,
          resume: !!savedEmployee.resume,
          offerLetter: !!savedEmployee.offerLetter
        }
      });
    } else {
      console.log(`User role ${userRole} does not require employee record`);
    }

    // Fetch updated employee data if it exists
    let updatedEmployeeData = null;
    if (['Sales Person', 'Lead Person', 'Manager', 'Employee', 'IT Manager', 'IT Intern', 'IT Permanent'].includes(userRole)) {
      const Employee = require('../models/Employee');
      updatedEmployeeData = await Employee.findOne({ userId: user._id })
        .populate('department', 'name')
        .populate('role', 'name');
    }

    res.status(200).json({
      success: true,
      data: user,
      employee: updatedEmployeeData
    });
  } catch (err) {
    console.error(`Error updating user with documents: ${err.message}`);
    console.error(`Error stack: ${err.stack}`);
    console.error(`Error details:`, {
      name: err.name,
      code: err.code,
      errors: err.errors
    });
    res.status(400).json({
      success: false,
      message: err.message,
      details: err.errors || err.message
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/me
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    console.log('Profile update requested by user:', req.user.id);
    console.log('Request body:', req.body);
    
    const { fullName, email } = req.body;
    
    // Build update object
    const updateData = {};
    if (fullName) updateData.fullName = fullName;
    if (email) updateData.email = email;
    
    // Update password if provided
    if (req.body.password) {
      updateData.password = req.body.password;
    }
    
    // Update user
    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Normalize email to lowercase for case-insensitive search
    const normalizedEmail = email ? email.toLowerCase().trim() : '';

    console.log('Forgot password request for:', normalizedEmail);
    console.log('Original email provided:', email);

    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email address'
      });
    }

    // Find user by email (case-insensitive)
    let user = await User.findOne({ email: normalizedEmail });
    
    // If not found, try case-insensitive regex search
    if (!user) {
      user = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    }

    if (!user) {
      console.log('User not found for email:', normalizedEmail);
      return res.status(404).json({
        success: false,
        message: 'User not found with that email address'
      });
    }

    console.log('Found user for password reset:', {
      id: user._id,
      email: user.email,
      role: user.role
    });

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Save OTP to user
    user.verifyOtp = otp;
    user.verifyOtpExpireAt = otpExpiry;
    await user.save();

    // Send OTP via email - use the user's email from database (not the normalized one)
    const emailText = `Your OTP for password reset is: ${otp}. This OTP will expire in 10 minutes.`;
    const emailHtml = `
      <h2>Password Reset OTP</h2>
      <p>Your OTP for password reset is: <strong>${otp}</strong></p>
      <p>This OTP will expire in 10 minutes.</p>
      <p>If you did not request this password reset, please ignore this email.</p>
    `;
    
    try {
      await sendEmail(
        user.email, // Use the actual email from database
        'Password Reset OTP - Traincape CRM',
        emailText,
        emailHtml
      );

      res.status(200).json({
        success: true,
        message: 'OTP sent to your email'
      });
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      
      // Still clear the OTP if email failed so user can try again
      user.verifyOtp = undefined;
      user.verifyOtpExpireAt = undefined;
      await user.save();
      
      return res.status(500).json({
        success: false,
        message: emailError.message || 'Failed to send OTP email. Please try again later or contact support.',
        error: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }
  } catch (error) {
    console.error('Forgot password error:', {
      message: error.message,
      stack: error.stack,
      originalError: error.originalError
    });
    
    // Don't expose internal error details in production
    const errorMessage = error.originalError 
      ? error.message 
      : 'Error processing password reset request. Please try again later.';
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/verifyOtp
// @access  Public
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Normalize email to lowercase for case-insensitive search
    const normalizedEmail = email ? email.toLowerCase().trim() : '';

    console.log('OTP verification request:', { email: normalizedEmail, otp });

    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email address'
      });
    }

    // Find user by email (case-insensitive)
    let user = await User.findOne({ email: normalizedEmail });
    
    // If not found, try case-insensitive regex search
    if (!user) {
      user = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if OTP matches and is not expired
    if (user.verifyOtp !== otp || Date.now() > user.verifyOtpExpireAt) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Generate reset OTP
    const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const resetOtpExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes

    console.log('Generating reset OTP:', {
      email,
      resetOtp,
      resetOtpExpiry
    });

    // Save reset OTP
    user.resetOtp = resetOtp;
    user.resetOtpExpireAt = resetOtpExpiry;
    user.verifyOtp = undefined;
    user.verifyOtpExpireAt = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      resetOtp
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying OTP',
      error: error.message
    });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset_password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { email, resetOtp, newPassword } = req.body;

    // Normalize email to lowercase for case-insensitive search
    const normalizedEmail = email ? email.toLowerCase().trim() : '';

    console.log('Password reset request:', {
      email: normalizedEmail,
      resetOtp,
      hasPassword: !!newPassword,
      passwordLength: newPassword ? newPassword.length : 0,
      body: req.body
    });

    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email address'
      });
    }

    // Validate password
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Find user by email (case-insensitive)
    let user = await User.findOne({ email: normalizedEmail });
    
    // If not found, try case-insensitive regex search
    if (!user) {
      user = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if reset OTP matches and is not expired
    console.log('Password Reset Validation:', {
      email,
      providedOtp: resetOtp,
      storedOtp: user.resetOtp,
      otpExpiry: new Date(user.resetOtpExpireAt),
      now: new Date(),
      timeDiff: (user.resetOtpExpireAt - Date.now()) / 1000 / 60 + ' minutes',
      password: newPassword ? 'provided' : 'missing',
      passwordLength: newPassword?.length
    });

    if (!user.resetOtp || !user.resetOtpExpireAt) {
      return res.status(400).json({
        success: false,
        message: 'No reset OTP found. Please request a new password reset.'
      });
    }

    if (user.resetOtp !== resetOtp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reset OTP. Please use the OTP from the verification step.'
      });
    }

    if (Date.now() > user.resetOtpExpireAt) {
      // Clear expired OTPs
      user.resetOtp = undefined;
      user.resetOtpExpireAt = undefined;
      await user.save();
      
      return res.status(400).json({
        success: false,
        message: 'Reset OTP has expired. Please request a new password reset.'
      });
    }

    // Update password
    user.password = newPassword;
    user.resetOtp = undefined;
    user.resetOtpExpireAt = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting password',
      error: error.message
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
