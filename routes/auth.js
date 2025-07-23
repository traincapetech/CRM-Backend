const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
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

router.route('/users/with-documents')
  .post(protect, createUserWithDocuments);

router.route('/users/:id/with-documents')
  .put(protect, updateUserWithDocuments);

module.exports = router; 