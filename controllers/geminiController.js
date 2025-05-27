const { generateContent, generateContentWithImage, chatWithGemini } = require('../utils/geminiService');

// @desc    Generate text content using Gemini
// @route   POST /api/gemini/generate
// @access  Private
exports.generateContent = async (req, res) => {
  try {
    const { prompt, options } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    const result = await generateContent(prompt, options);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.status(200).json({
      success: true,
      data: result.content
    });
  } catch (error) {
    console.error('Controller error in generateContent:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error'
    });
  }
};

// @desc    Generate content with image using Gemini
// @route   POST /api/gemini/generate-with-image
// @access  Private
exports.generateContentWithImage = async (req, res) => {
  try {
    const { prompt, imageData } = req.body;
    
    if (!prompt || !imageData) {
      return res.status(400).json({
        success: false,
        error: 'Prompt and image data are required'
      });
    }

    const result = await generateContentWithImage(prompt, imageData);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.status(200).json({
      success: true,
      data: result.content
    });
  } catch (error) {
    console.error('Controller error in generateContentWithImage:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error'
    });
  }
};

// @desc    Chat with Gemini
// @route   POST /api/gemini/chat
// @access  Private
exports.chatWithGemini = async (req, res) => {
  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid chat messages array is required'
      });
    }

    const result = await chatWithGemini(messages);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.status(200).json({
      success: true,
      data: result.content
    });
  } catch (error) {
    console.error('Controller error in chatWithGemini:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error'
    });
  }
}; 