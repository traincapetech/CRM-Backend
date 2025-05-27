// Simple test script to check if Gemini API is working
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Gemini model name
const MODEL_NAME = "gemini-1.5-pro";

// Log environment variables
console.log('GEMINI_API_KEY set:', process.env.GEMINI_API_KEY ? 'Yes' : 'No');
if (process.env.GEMINI_API_KEY) {
  console.log('API Key starts with:', process.env.GEMINI_API_KEY.substring(0, 10) + '...');
} else {
  console.error('ERROR: GEMINI_API_KEY not found in environment variables!');
  process.exit(1);
}

async function testGemini() {
  try {
    console.log('Initializing Gemini API...');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    console.log(`Creating model: ${MODEL_NAME}...`);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    
    console.log('Sending test prompt...');
    const prompt = "Hello, how are you today?";
    const result = await model.generateContent(prompt);
    
    console.log('Response received!');
    const response = result.response;
    const text = response.text();
    
    console.log('\nTest successful! Response from Gemini:');
    console.log('----------------------------------------');
    console.log(text);
    console.log('----------------------------------------');
    
    return true;
  } catch (error) {
    console.error('ERROR: Failed to use Gemini API:', error);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    return false;
  }
}

// Execute the test
testGemini()
  .then(success => {
    if (success) {
      console.log('✅ Gemini API is working correctly!');
    } else {
      console.error('❌ Gemini API test failed!');
    }
  })
  .catch(err => {
    console.error('Error during test execution:', err);
  }); 