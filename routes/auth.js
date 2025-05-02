const express = require('express');
const router = express.Router();
const { register, login, getMe, getAllUsers, updateUser, deleteUser } = require('../controllers/auth');
const { protect, authorize } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const UserModel = require('../models/User.js');


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

router.put('/users/:id', protect, authorize('Admin'), updateUser);
console.log('PUT /api/auth/users/:id registered');

router.delete('/users/:id', protect, authorize('Admin'), deleteUser);
console.log('DELETE /api/auth/users/:id registered');

router.post("/sendOTPToEmail", async (req, res) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  const { email } = req.body;
  try {
    const user = await UserModel.findOne({ email });
    if (!user) {
      return res
        .status(400)
        .send({ msg: "Email Id does not exist in the database" });
    }
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    user.verifyOtp = otp;
    user.verifyOtpExpireAt = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      // to: email,
      subject: "Password Reset OTP",
      html: `
      <!-- Updated HTML template with image -->
<div style="font-family: Arial, sans-serif; text-align: center; padding: 20px; background-color: #f4f4f4;">
  <div style="max-width: 600px; margin: auto; background: #fff; padding: 20px; border-radius: 10px; border: 1px solid #ddd;">
      <h2 style="color: #333;">OTP Verification</h2>
      <p style="color: #555; font-size: 16px;">Your One-Time Password (OTP) for verification is:</p>
      <div style="font-size: 24px; font-weight: bold; color: #333; padding: 10px 20px; background: #f8f8f8; border: 1px dashed #333; display: inline-block; margin: 10px 0;">
          ${otp}
      </div>
      <p style="color: #777; font-size: 14px;">This OTP is valid for only 10 minutes. Do not share it with anyone.</p>
      <p style="color: #777; font-size: 14px;">If you did not request this, please ignore this email.</p>
      <div style="font-size: 12px; color: #aaa; margin-top: 20px;">© 2025 TrainCape Industries</div>
  </div>
</div>
`,
    };

    // Use Promise for better async handling
    transporter
      .sendMail(mailOptions)
      .then(() => {
        return res.json({ success: true, message: "OTP sent successfully" });
      })
      .catch((error) => {
        console.error(error);
        return res.status(500).json({ message: "Error sending email" });
      });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: "Internal Server Error" });
  }
});

router.post("/verifyOtp", async (req, res) => {
  const { otp, email } = req.body;
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
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetOtp = "";
    user.resetOtpExpireAt = 0;

    await user.save();
    return res.json({
      success: true,
      message: "Password has been changed Successfully",
    });
  } catch (error) {
    console.error(error);
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

module.exports = router; 