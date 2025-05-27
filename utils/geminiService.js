const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini API with the API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Available model names
const MODEL_GEMINI_PRO = "gemini-1.5-pro";
const MODEL_GEMINI_PRO_VISION = "gemini-1.5-pro-vision";

// Function to initialize the Gemini API
const initGeminiAPI = () => {
  console.log('Initializing Gemini API...');
  console.log('GEMINI_API_KEY set:', GEMINI_API_KEY ? 'Yes' : 'No');
  
  if (!GEMINI_API_KEY) {
    console.error('Error: GEMINI_API_KEY environment variable is not set');
    return null;
  }
  
  try {
    console.log('Creating GoogleGenerativeAI instance with key:', GEMINI_API_KEY.substring(0, 10) + '...');
    return new GoogleGenerativeAI(GEMINI_API_KEY);
  } catch (error) {
    console.error('Error initializing Gemini API:', error);
    return null;
  }
};

// Generate text content using Gemini Pro model
const generateContent = async (prompt, options = {}) => {
  console.log('generateContent called with prompt:', typeof prompt, prompt ? prompt.substring(0, 50) : 'undefined');
  
  try {
    const genAI = initGeminiAPI();
    if (!genAI) {
      console.error('Failed to initialize Gemini API');
      return { 
        success: false, 
        error: 'Gemini API not initialized' 
      };
    }

    // Use Gemini Pro model
    console.log(`Creating generative model: ${MODEL_GEMINI_PRO}`);
    const model = genAI.getGenerativeModel({ model: MODEL_GEMINI_PRO });
    
    // Generate content
    console.log('Generating content...');
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    console.log('Content generated successfully');
    return {
      success: true,
      content: text
    };
  } catch (error) {
    console.error('Error generating content with Gemini:', error);
    // Log detailed error information
    if (error.response) {
      console.error('Error response data:', error.response.data);
    }
    console.error('Error stack:', error.stack);
    
    return {
      success: false,
      error: error.message || 'Error generating content'
    };
  }
};

// Generate content with image using Gemini Pro Vision model
const generateContentWithImage = async (prompt, imageData) => {
  console.log('generateContentWithImage called with prompt:', typeof prompt, prompt ? prompt.substring(0, 50) : 'undefined');
  console.log('Image data provided:', imageData ? 'Yes' : 'No');
  
  try {
    const genAI = initGeminiAPI();
    if (!genAI) {
      console.error('Failed to initialize Gemini API');
      return { 
        success: false, 
        error: 'Gemini API not initialized' 
      };
    }

    // Use Gemini Pro Vision model for image + text prompts
    console.log(`Creating generative model: ${MODEL_GEMINI_PRO_VISION}`);
    const model = genAI.getGenerativeModel({ model: MODEL_GEMINI_PRO_VISION });
    
    // Parse the image (assuming base64 format)
    console.log('Preparing image data...');
    const imageParts = [
      {
        inlineData: {
          data: imageData,
          mimeType: "image/jpeg", // Adjust MIME type if needed
        },
      },
    ];

    // Generate content
    console.log('Generating content with image...');
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = result.response;
    const text = response.text();
    
    console.log('Content with image generated successfully');
    return {
      success: true,
      content: text
    };
  } catch (error) {
    console.error('Error generating content with image using Gemini:', error);
    // Log detailed error information
    if (error.response) {
      console.error('Error response data:', error.response.data);
    }
    console.error('Error stack:', error.stack);
    
    return {
      success: false,
      error: error.message || 'Error generating content with image'
    };
  }
};

// Chat with Gemini model
const chatWithGemini = async (messages) => {
  console.log('chatWithGemini called with messages:', messages.length);
  
  try {
    const genAI = initGeminiAPI();
    if (!genAI) {
      console.error('Failed to initialize Gemini API');
      return { 
        success: false, 
        error: 'Gemini API not initialized' 
      };
    }

    // Use Gemini Pro model for chat
    console.log(`Creating generative model: ${MODEL_GEMINI_PRO} for chat`);
    const model = genAI.getGenerativeModel({ model: MODEL_GEMINI_PRO });
    
    // Create a new chat session
    console.log('Starting chat session with history length:', messages.length - 1);
    const chat = model.startChat({
      history: messages.slice(0, -1), // All messages except the last one
    });

    // Send the last message to the chat
    console.log('Sending latest message to chat:', messages[messages.length - 1].parts);
    const result = await chat.sendMessage(messages[messages.length - 1].parts);
    const response = result.response;
    const text = response.text();
    
    console.log('Chat response generated successfully');
    return {
      success: true,
      content: text
    };
  } catch (error) {
    console.error('Error chatting with Gemini:', error);
    // Log detailed error information
    if (error.response) {
      console.error('Error response data:', error.response.data);
    }
    console.error('Error stack:', error.stack);
    
    return {
      success: false,
      error: error.message || 'Error chatting with Gemini'
    };
  }
};

module.exports = {
  generateContent,
  generateContentWithImage,
  chatWithGemini
}; 