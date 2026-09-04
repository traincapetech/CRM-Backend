const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const UserSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Please add a name"],
      trim: true,
      maxlength: [50, "Name cannot be more than 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/,
        "Please add a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Please add a password"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: [
        "Sales Person",
        "Sales Team Leader",
        "Team Leader",
        "Senior Sales Executive",
        "Sales Executive",
        "Sales Manager",
        "Lead Person",
        "Manager",
        "Admin",
        "Customer",
        "HR",
        "Employee",
        "IT Staff",
        "IT Manager",
        "IT Intern",
        "IT Permanent",
        "Branch Partner",
      ],
      default: "Sales Person",
    },
    roles: [
      {
        type: String,
        trim: true,
      },
    ],
    // Employee reference for Employee role users
    employeeId: {
      type: mongoose.Schema.ObjectId,
      ref: "Employee",
    },
    branchId: {
      type: mongoose.Schema.ObjectId,
      ref: "Branch",
    },
    profilePicture: {
      type: String,
      default: null,
    },
    // Chat-related fields
    chatStatus: {
      type: String,
      enum: ["ONLINE", "OFFLINE", "AWAY"],
      default: "OFFLINE",
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    verifyOtp: { type: String, default: null },
    verifyOtpExpireAt: { type: Number, default: 0 },
    resetOtp: { type: String, default: null },
    resetOtpExpireAt: { type: Number, default: 0 },
    active: {
      type: Boolean,
      default: true,
    },
    // Two-Factor Authentication fields
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
      select: false, // Don't include in queries by default
    },
    twoFactorBackupCodes: [
      {
        type: String,
        select: false, // Hashed backup codes
      },
    ],
    refreshToken: {
      type: String,
      select: false,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Number,
    },
    // Performance Improvement Plan (PIP) Status
    isUnderPIP: {
      type: Boolean,
      default: false,
    },
    pipStartDate: {
      type: Date,
    },
    pipEndDate: {
      type: Date,
    },
  },
  {
    // Use the existing collection
    collection: "users",
  },
);

// Encrypt password using bcrypt
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Sign Access Token (JWT)
UserSchema.methods.getSignedJwtToken = function () {
  if (!process.env.JWT_SECRET) {
    throw new Error("CRITICAL: JWT_SECRET not set.");
  }

  // Issuing access token (8 hours)
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || "8h" }
  );
};

// Sign Refresh Token (JWT)
UserSchema.methods.getSignedRefreshToken = function () {
  if (!process.env.REFRESH_TOKEN_SECRET) {
    throw new Error("CRITICAL: REFRESH_TOKEN_SECRET not set.");
  }

  // Issuing long-lived refresh token (7 days)
  return jwt.sign(
    { id: this._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || "7d" }
  );
};

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  try {
    return await bcrypt.compare(enteredPassword, this.password);
  } catch (error) {
    console.error("Error comparing passwords:", error);
    throw error;
  }
};

UserSchema.index({ role: 1 });
UserSchema.index({ employeeId: 1 });

module.exports = mongoose.model("User", UserSchema);
