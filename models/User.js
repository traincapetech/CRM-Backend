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

// Sign JWT and return
UserSchema.methods.getSignedJwtToken = function () {
  // SECURITY: Fail fast if JWT_SECRET is not configured
  if (!process.env.JWT_SECRET) {
    throw new Error(
      "CRITICAL: JWT_SECRET environment variable is not set. Cannot generate tokens.",
    );
  }

  console.log("Generating JWT token for user:", {
    id: this._id,
    role: this.role,
    JWT_SECRET: "Set",
    JWT_EXPIRE: process.env.JWT_EXPIRE || "30d",
  });

  const token = jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || "30d" },
  );

  return token;
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

module.exports = mongoose.model("User", UserSchema);
