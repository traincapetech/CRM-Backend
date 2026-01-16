const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const fileStorage = require('../services/fileStorageService');
const {
  register,
  login,
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
  updateUserWithDocuments
} = require('../controllers/auth');

// Debug middleware
const debugMiddleware = (req, res, next) => {
  console.log('Auth route accessed:', {
    method: req.method,
    path: req.path,
    user: req.user ? {
      id: req.user.id,
      role: req.user.role
    } : 'Not authenticated',
    query: req.query,
    params: req.params
  });
  next();
};

// Apply debug middleware to all routes
router.use(debugMiddleware);

// Public routes
router.route('/register')
  .post(register);

router.route('/login')
  .post(login);

router.route('/forgot-password')
  .post(forgotPassword);

router.route('/verifyOtp')
  .post(verifyOTP);

router.route('/reset_password')
  .post(resetPassword);

// Protected routes
router.route('/me')
  .get(protect, getMe)
  .put(protect, updateProfile);

router.route('/profile-picture')
  .put(protect, updateProfilePicture);

// Admin only routes
router.route('/users')
  .get(protect, getAllUsers)
  .post(protect, createUser);

router.route('/users/:id')
  .put(protect, updateUser)
  .delete(protect, deleteUser);

router.route('/users/:id/toggle-active')
  .put(protect, toggleUserActive);

router.route('/users/with-documents')
  .post(
    protect,
    fileStorage.uploadMiddleware.fields([
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
    ]),
    createUserWithDocuments
  );

router.route('/users/:id/with-documents')
  .put(
    protect,
    fileStorage.uploadMiddleware.fields([
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
    ]),
    updateUserWithDocuments
  );

module.exports = router; 