const express = require('express');
const router = express.Router();
const { register, login, getMe, getAllUsers, updateUser, deleteUser } = require('../controllers/auth');
const { protect, authorize } = require('../middleware/auth');

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