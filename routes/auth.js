const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const fileStorage = require("../services/fileStorageService");
const {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  updateProfilePicture,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  toggleUserActive,
  forgotPassword,
  verifyOTP,
  resetPassword,
  createUserWithDocuments,
  updateUserWithDocuments,
} = require("../controllers/auth");

// 2FA Controller
const {
  setup2FA,
  verify2FA,
  validate2FA,
  disable2FA,
  get2FAStatus,
  regenerateBackupCodes,
} = require("../controllers/twoFactor");

// Debug middleware
const debugMiddleware = (req, res, next) => {
  console.log("Auth route accessed:", {
    method: req.method,
    path: req.path,
    user: req.user
      ? {
          id: req.user.id,
          role: req.user.role,
        }
      : "Not authenticated",
    query: req.query,
    params: req.params,
  });
  next();
};

// Apply debug middleware to all routes
router.use(debugMiddleware);

// Public routes
router.route("/register").post(register);

router.route("/login").post(login);

router.route("/forgot-password").post(forgotPassword);

router.route("/verifyOtp").post(verifyOTP);

router.route("/reset_password").post(resetPassword);

// Logout route (clears httpOnly cookie)
router.route("/logout").post(logout);

// 2FA routes
router.route("/2fa/setup").post(protect, setup2FA);
router.route("/2fa/verify").post(protect, verify2FA);
router.route("/2fa/validate").post(validate2FA); // Public - used during login
router.route("/2fa/disable").post(protect, disable2FA);
router.route("/2fa/status").get(protect, get2FAStatus);
router.route("/2fa/backup-codes").post(protect, regenerateBackupCodes);

// Protected routes
router.route("/me").get(protect, getMe).put(protect, updateProfile);

router
  .route("/profile-picture")
  .put(
    protect,
    fileStorage.uploadMiddleware.fields([
      { name: "profilePicture", maxCount: 1 },
    ]),
    updateProfilePicture,
  );

// Admin only routes
router.route("/users").get(protect, getAllUsers).post(protect, createUser);

router.route("/users/:id").put(protect, updateUser).delete(protect, deleteUser);

router.route("/users/:id/toggle-active").put(protect, toggleUserActive);

router.route("/users/with-documents").post(
  protect,
  fileStorage.uploadMiddleware.fields([
    { name: "photograph", maxCount: 1 },
    { name: "tenthMarksheet", maxCount: 1 },
    { name: "twelfthMarksheet", maxCount: 1 },
    { name: "bachelorDegree", maxCount: 1 },
    { name: "postgraduateDegree", maxCount: 1 },
    { name: "aadharCard", maxCount: 1 },
    { name: "panCard", maxCount: 1 },
    { name: "pcc", maxCount: 1 },
    { name: "resume", maxCount: 1 },
    { name: "offerLetter", maxCount: 1 },
  ]),
  createUserWithDocuments,
);

router.route("/users/:id/with-documents").put(
  protect,
  fileStorage.uploadMiddleware.fields([
    { name: "photograph", maxCount: 1 },
    { name: "tenthMarksheet", maxCount: 1 },
    { name: "twelfthMarksheet", maxCount: 1 },
    { name: "bachelorDegree", maxCount: 1 },
    { name: "postgraduateDegree", maxCount: 1 },
    { name: "aadharCard", maxCount: 1 },
    { name: "panCard", maxCount: 1 },
    { name: "pcc", maxCount: 1 },
    { name: "resume", maxCount: 1 },
    { name: "offerLetter", maxCount: 1 },
  ]),
  updateUserWithDocuments,
);

module.exports = router;
