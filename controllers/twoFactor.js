/**
 * Two-Factor Authentication Controller
 *
 * Handles 2FA setup, verification, and management
 */

const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const User = require("../models/User");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

// Generate backup codes
const generateBackupCodes = () => {
  const codes = [];
  for (let i = 0; i < 10; i++) {
    codes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
  }
  return codes;
};

// Hash backup codes for storage
const hashBackupCodes = async (codes) => {
  const hashed = await Promise.all(codes.map((code) => bcrypt.hash(code, 10)));
  return hashed;
};

// @desc    Setup 2FA - Generate secret and QR code
// @route   POST /api/auth/2fa/setup
// @access  Private
exports.setup2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("+twoFactorSecret");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Generate a new secret
    const secret = speakeasy.generateSecret({
      name: `TraincapeCRM:${user.email}`,
      issuer: "Traincape CRM",
      length: 32,
    });

    // Store the secret temporarily (not enabled yet)
    user.twoFactorSecret = secret.base32;
    await user.save();

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.status(200).json({
      success: true,
      data: {
        secret: secret.base32,
        qrCode: qrCodeUrl,
        manualEntry: secret.base32,
      },
    });
  } catch (error) {
    console.error("2FA setup error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to setup 2FA",
    });
  }
};

// @desc    Verify and enable 2FA
// @route   POST /api/auth/2fa/verify
// @access  Private
exports.verify2FA = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Please provide the 6-digit code",
      });
    }

    const user = await User.findById(req.user.id).select("+twoFactorSecret");

    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({
        success: false,
        message: "Please setup 2FA first",
      });
    }

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: token,
      window: 2, // Allow 1 step before and after for clock drift
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code. Please try again.",
      });
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = await hashBackupCodes(backupCodes);

    // Enable 2FA
    user.twoFactorEnabled = true;
    user.twoFactorBackupCodes = hashedBackupCodes;
    await user.save();

    res.status(200).json({
      success: true,
      message: "2FA enabled successfully",
      data: {
        backupCodes: backupCodes, // Send plain backup codes only once
      },
    });
  } catch (error) {
    console.error("2FA verify error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify 2FA",
    });
  }
};

// @desc    Validate 2FA during login
// @route   POST /api/auth/2fa/validate
// @access  Public (but requires tempToken from login)
exports.validate2FA = async (req, res) => {
  try {
    const { userId, token, isBackupCode } = req.body;

    if (!userId || !token) {
      return res.status(400).json({
        success: false,
        message: "Please provide userId and verification code",
      });
    }

    const user = await User.findById(userId).select(
      "+twoFactorSecret +twoFactorBackupCodes +password",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        message: "2FA is not enabled for this account",
      });
    }

    let verified = false;

    if (isBackupCode) {
      // Check backup codes
      for (let i = 0; i < user.twoFactorBackupCodes.length; i++) {
        const match = await bcrypt.compare(
          token.toUpperCase(),
          user.twoFactorBackupCodes[i],
        );
        if (match) {
          verified = true;
          // Remove used backup code
          user.twoFactorBackupCodes.splice(i, 1);
          await user.save();
          break;
        }
      }
    } else {
      // Verify TOTP
      verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: token,
        window: 2,
      });
    }

    if (!verified) {
      return res.status(401).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    // Generate JWT token
    const jwtToken = user.getSignedJwtToken();

    // Cookie options
    const cookieOptions = {
      expires: new Date(Date.now() + 9 * 60 * 60 * 1000), // 9 hours
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    };

    res.cookie("token", jwtToken, cookieOptions);

    const { getUserPermissions } = require("../utils/rbac");
    const permissionPayload = await getUserPermissions(user);

    res.status(200).json({
      success: true,
      token: jwtToken,
      user: {
        _id: user._id,
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        roles: permissionPayload.roleNames,
        permissions: permissionPayload.permissions,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (error) {
    console.error("2FA validate error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to validate 2FA",
    });
  }
};

// @desc    Disable 2FA
// @route   POST /api/auth/2fa/disable
// @access  Private
exports.disable2FA = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Please provide your password",
      });
    }

    const user = await User.findById(req.user.id).select(
      "+password +twoFactorSecret",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid password",
      });
    }

    // Disable 2FA
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorBackupCodes = [];
    await user.save();

    res.status(200).json({
      success: true,
      message: "2FA disabled successfully",
    });
  } catch (error) {
    console.error("2FA disable error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to disable 2FA",
    });
  }
};

// @desc    Get 2FA status
// @route   GET /api/auth/2fa/status
// @access  Private
exports.get2FAStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        twoFactorEnabled: user.twoFactorEnabled || false,
      },
    });
  } catch (error) {
    console.error("2FA status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get 2FA status",
    });
  }
};

// @desc    Regenerate backup codes
// @route   POST /api/auth/2fa/backup-codes
// @access  Private
exports.regenerateBackupCodes = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Please provide your password",
      });
    }

    const user = await User.findById(req.user.id).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        message: "2FA is not enabled",
      });
    }

    // Verify password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid password",
      });
    }

    // Generate new backup codes
    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = await hashBackupCodes(backupCodes);

    user.twoFactorBackupCodes = hashedBackupCodes;
    await user.save();

    res.status(200).json({
      success: true,
      data: {
        backupCodes: backupCodes,
      },
    });
  } catch (error) {
    console.error("Backup codes regenerate error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to regenerate backup codes",
    });
  }
};
