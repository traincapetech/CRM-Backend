require('dotenv').config();
const { sendEmail } = require('./config/nodemailer');

async function test() {
  console.log("--- Starting Email Test ---");
  try {
    const success = await sendEmail(
      "sales@traincapetech.in", // Sending to self as a test
      "System Test: Onboarding Email",
      "If you see this, the email system is working correctly.",
      "<h1>Test Successful</h1><p>The onboarding email system is configured correctly.</p>"
    );
    console.log("Result:", success ? "✅ SUCCESS" : "❌ FAILED");
  } catch (error) {
    console.error("❌ TEST CRASHED:", error.message);
    if (error.originalError) {
      console.error("Detail:", error.originalError.message);
    }
  }
}

test();
