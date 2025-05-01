const express = require('express');
const router = express.Router();
const { getRates } = require('../controllers/currency');

// @route   GET /api/currency/rates
// @desc    Get latest exchange rates
// @access  Public
router.get('/rates', getRates);

module.exports = router; 