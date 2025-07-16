const express = require('express');
const router = express.Router();
const { register, login, getMe, getAllUsers, updateUser, deleteUser, updateProfilePicture, createUser, createUserWithDocuments, updateUserWithDocuments } = require('../controllers/auth');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const UserModel = require('../models/User.js');
const { upload, storageType, getFileUrl, deleteFile } = require('../config/storage');

// Document upload middleware using centralized storage config
const uploadDocuments = upload.fields([
  { name: 'photograph', maxCount: 1 },
  { name: 'tenthMarksheet', maxCount: 1 },
  { name: 'twelfthMarksheet', maxCount: 1 },
  { name: 'bachelorDegree', maxCount: 1 },
  { name: 'postgraduateDegree', maxCount: 1 },
  { name: 'aadharCard', maxCount: 1 },
  { name: 'panCard', maxCount: 1 },
  { name: 'pcc', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
  { name: 'offerLetter', maxCount: 1 }
]);

// Profile picture upload middleware using centralized storage config
const uploadProfilePicture = upload.fields([
  { name: 'profilePicture', maxCount: 1 }
]);


// Register all routes
console.log('Registering auth routes...');

router.post('/register', register);
console.log('POST /api/auth/register registered');

router.post('/login', login);
console.log('POST /api/auth/login registered');

router.get('/me', protect, getMe);
console.log('GET /api/auth/me registered');

router.get('/users', protect, getAllUsers);
console.log('GET /api/auth/users registered');

router.post('/users', protect, authorize('Admin', 'Manager'), createUser);
console.log('POST /api/auth/users registered');

router.post('/users/with-documents', protect, authorize('Admin', 'Manager'), uploadDocuments, createUserWithDocuments);
console.log('POST /api/auth/users/with-documents registered');

router.put('/users/:id', protect, authorize('Admin', 'Manager'), updateUser);
console.log('PUT /api/auth/users/:id registered');

// Handle document uploads optionally for user updates
router.put('/users/:id/with-documents', protect, authorize('Admin', 'Manager'), (req, res, next) => {
  // Use uploadDocuments middleware but handle errors gracefully
  uploadDocuments(req, res, (err) => {
    if (err) {
      console.log('File upload error (continuing without files):', err.message);
      // Continue without files if upload fails
      req.files = {};
    }
    next();
  });
}, updateUserWithDocuments);
console.log('PUT /api/auth/users/:id/with-documents registered');

// Serve documents with proper authentication and storage-agnostic support
router.get('/documents/:filename', protect, async (req, res) => {
  try {
    const { filename } = req.params;
    
    if (storageType === 's3') {
      // For S3 storage, generate signed URL for secure access
      const AWS = require('aws-sdk');
      const s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION
      });
      
      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: `documents/${filename}`,
        Expires: 3600 // 1 hour expiry
      };
      
      try {
        const signedUrl = s3.getSignedUrl('getObject', params);
        return res.redirect(signedUrl);
      } catch (s3Error) {
        console.error('S3 signed URL error:', s3Error);
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }
    } else {
      // For local storage, serve files directly
      const { currentConfig } = require('../config/storage');
      const filePath = path.join(currentConfig.destination, filename);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }
      
      // Get file stats
      const stats = fs.statSync(filePath);
      
      // Set appropriate headers based on file extension
      const ext = path.extname(filename).toLowerCase();
      let contentType = 'application/octet-stream';
      
      switch (ext) {
        case '.pdf':
          contentType = 'application/pdf';
          break;
        case '.jpg':
        case '.jpeg':
          contentType = 'image/jpeg';
          break;
        case '.png':
          contentType = 'image/png';
          break;
        case '.gif':
          contentType = 'image/gif';
          break;
        case '.doc':
          contentType = 'application/msword';
          break;
        case '.docx':
          contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          break;
        default:
          contentType = 'application/octet-stream';
      }
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.setHeader('Expires', '-1');
      res.setHeader('Pragma', 'no-cache');
      
      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      
      fileStream.on('error', (error) => {
        console.error('File stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Error reading file'
          });
        }
      });
      
      fileStream.pipe(res);
    }
    
  } catch (error) {
    console.error('Error serving document:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Error serving document'
      });
    }
  }
});
console.log('GET /api/auth/documents/:filename registered');

router.delete('/users/:id', protect, authorize('Admin', 'Manager'), deleteUser);
console.log('DELETE /api/auth/users/:id registered');

router.put('/profile-picture', protect, uploadProfilePicture, updateProfilePicture);
console.log('PUT /api/auth/profile-picture registered');

router.post("/sendOTPToEmail", async (req, res) => {
  console.log("Received request to sendOTPToEmail:", req.body);
  
  // Log environment variables for debugging (without leaking secrets)
  console.log("Email config:", { 
    emailUser: process.env.EMAIL_USER ? `${process.env.EMAIL_USER.substring(0, 5)}...` : 'undefined',
    emailPassSet: process.env.EMAIL_PASS ? 'Yes' : 'No'
  });

  // Check if email configuration is set
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("Email configuration missing:", {
      hasEmailUser: !!process.env.EMAIL_USER,
      hasEmailPass: !!process.env.EMAIL_PASS
    });
    return res.status(500).json({
      success: false,
      message: "Email server configuration is missing. Please contact support.",
      error: "Missing email configuration"
    });
  }
  
  const transporter = nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  // Verify transporter configuration
  try {
    await transporter.verify();
    console.log("Email transporter verified successfully");
  } catch (error) {
    console.error("Email transporter verification failed:", error);
    return res.status(500).json({
      success: false,
      message: "Email server configuration is invalid. Please contact support.",
      error: error.message
    });
  }
  
  const { email } = req.body;
  
  if (!email) {
    console.log("Email not provided in request");
    return res.status(400).json({ success: false, message: "Email is required" });
  }
  
  try {
    console.log(`Looking for user with email: ${email}`);
    const user = await UserModel.findOne({ email });
    
    if (!user) {
      console.log(`User with email ${email} not found`);
      return res.status(400).json({ 
        success: false, 
        message: "Email ID does not exist in the database" 
      });
    }
    
    console.log(`User found, generating OTP for ${email}`);
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    user.verifyOtp = otp;
    user.verifyOtpExpireAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry
    
    await user.save();
    console.log(`OTP saved to user database: ${otp}`);
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset OTP",
      html: `
      <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: auto; background: #fff; padding: 20px; border-radius: 10px; border: 1px solid #ddd;">
          <h2 style="color: #333;">OTP Verification</h2>
          <p style="color: #555; font-size: 16px;">Your One-Time Password (OTP) for verification is:</p>
          <div style="font-size: 24px; font-weight: bold; color: #333; padding: 10px 20px; background: #f8f8f8; border: 1px dashed #333; display: inline-block; margin: 10px 0;">
            ${otp}
          </div>
          <p style="color: #777; font-size: 14px;">This OTP is valid for 10 minutes. Do not share it with anyone.</p>
          <p style="color: #777; font-size: 14px;">If you did not request this, please ignore this email.</p>
          <div style="font-size: 12px; color: #aaa; margin-top: 20px;">© 2025 TrainCape Industries</div>
        </div>
      </div>
      `
    };

    console.log("Attempting to send email now...");
    
    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.messageId);
    return res.json({ success: true, message: "OTP sent successfully" });
    
  } catch (error) {
    console.error("Error in sendOTPToEmail:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    
    // Provide more specific error messages
    if (error.code === 'EAUTH') {
      return res.status(500).json({
        success: false,
        message: "Email authentication failed. Please contact support.",
        error: "Invalid email credentials"
      });
    }
    
    if (error.code === 'ESOCKET') {
      return res.status(500).json({
        success: false,
        message: "Could not connect to email server. Please try again later.",
        error: "Connection error"
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: "Failed to send OTP. Please try again later.",
      error: error.message
    });
  }
});

router.post("/verifyOtp", async (req, res) => {
  const { otp, email } = req.body;
  console.log("req.body", req.body);
  console.log("otp", otp);
  console.log("email", email);
  try {
    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(400).send({ msg: "Wrong Credentials" });
    }
    if (user.verifyOtp !== otp || user.verifyOtp === "") {
      return res.json({ success: false, message: "Invalid OTP" });
    }
    if (user.verifyOtpExpireAt < Date.now()) {
      return res.json({ success: false, message: "OTP expired" });
    }
    user.verifyOtp = "";
    user.verifyOTPExpireAt = 0;
    await user.save();
    return res.json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    console.error(error);
    return res.json({ success: false, message: error.message });
  }
});

router.post("/reset_password", async (req, res) => {
  const { email, newPassword } = req.body;
  try {
    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(400).send({ msg: "Wrong Credentials" });
    }
    
    // Don't hash the password here - let the pre-save hook handle it
    // This prevents double-hashing which causes login failures
    console.log("Setting new password for user:", user._id);
    user.password = newPassword;
    user.resetOtp = "";
    user.resetOtpExpireAt = 0;

    await user.save();
    console.log("Password reset successful for user:", user._id);
    
    return res.json({
      success: true,
      message: "Password has been changed Successfully",
    });
  } catch (error) {
    console.error("Password reset error:", error);
    return res.json({ success: false, message: error.message });
  }
});




// Debug route to check token
router.get('/debug', protect, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Token is valid',
    user: req.user
  });
});
console.log('GET /api/auth/debug registered');

// Test route for profile picture update
router.get('/profile-picture-test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Profile picture endpoint is available'
  });
});
console.log('GET /api/auth/profile-picture-test registered');

module.exports = router; 