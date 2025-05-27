const express = require('express');
const router = express.Router();
const { generateContent, generateContentWithImage, chatWithGemini } = require('../controllers/geminiController');

// Gemini routes
router.post('/generate', generateContent);
router.post('/generate-with-image', generateContentWithImage);
router.post('/chat', chatWithGemini);

module.exports = router; 