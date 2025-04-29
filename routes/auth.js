const express = require('express');
const router = express.Router();
const { register, login, getMe, getAllUsers } = require('../controllers/auth');
const { protect, authorize } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.get('/users', protect, getAllUsers);

// Debug route to check token
router.get('/debug', protect, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Token is valid',
    user: req.user
  });
});

module.exports = router; 