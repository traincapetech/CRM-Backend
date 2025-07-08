const { sendPaymentConfirmationEmail, sendServiceDeliveryEmail } = require('./services/emailService');
require('dotenv').config();

// Test data
const testSaleData = {
  customerName: 'Test Customer',
  email: 'test@example.com', // Change this to your test email
  course: 'PL-300 Test Course',
  totalCost: 15000,
  totalCostCurrency: 'INR',
  tokenAmount: 5000,
  tokenAmountCurrency: 'INR',
  date: new Date()
};

// Test different sales person emails
const testEmails = [
  'saurav@traincapetech.in', // Hostinger
  'test@gmail.com',          // Gmail (if you have one)
  'test@outlook.com',        // Outlook (if you have one)
  'test@yahoo.com'           // Yahoo (if you have one)
];

const testEmailConfiguration = async () => {
  console.log('🧪 Testing Email Configuration...\n');
  
  // Test each email provider
  for (const salesPersonEmail of testEmails) {
    console.log(`\n📧 Testing with sales person: ${salesPersonEmail}`);
    console.log('=' .repeat(50));
    
    try {
      // Test payment confirmation email
      console.log('Testing payment confirmation email...');
      const paymentResult = await sendPaymentConfirmationEmail(testSaleData, salesPersonEmail);
      
      if (paymentResult.success) {
        console.log('✅ Payment confirmation email test: SUCCESS');
        console.log(`   Message ID: ${paymentResult.messageId}`);
      } else {
        console.log('❌ Payment confirmation email test: FAILED');
        console.log(`   Error: ${paymentResult.message || paymentResult.error}`);
      }
      
      // Wait a bit between emails
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Test service delivery email
      console.log('Testing service delivery email...');
      const deliveryResult = await sendServiceDeliveryEmail(testSaleData, salesPersonEmail);
      
      if (deliveryResult.success) {
        console.log('✅ Service delivery email test: SUCCESS');
        console.log(`   Message ID: ${deliveryResult.messageId}`);
      } else {
        console.log('❌ Service delivery email test: FAILED');
        console.log(`   Error: ${deliveryResult.message || deliveryResult.error}`);
      }
      
    } catch (error) {
      console.log('❌ Email test failed with exception:');
      console.log(`   ${error.message}`);
    }
    
    console.log(''); // Empty line for readability
  }
  
  console.log('\n🏁 Email testing completed!');
  console.log('\nNext steps:');
  console.log('1. Check your test email inbox for received emails');
  console.log('2. Verify the dynamic content is correct');
  console.log('3. Check that sales person gets CC copies');
  console.log('4. Update environment variables for any failed providers');
};

// Run the test
testEmailConfiguration().catch(console.error);

// Instructions for running this test
console.log(`
📋 EMAIL TEST INSTRUCTIONS:

1. Update testSaleData.email to your actual test email address
2. Set up environment variables for the email providers you want to test:
   
   For Hostinger:
   HOSTINGER_EMAIL_PASS=your_hostinger_password
   
   For Gmail:
   GMAIL_APP_PASS=your_gmail_app_password
   
   For Outlook:
   OUTLOOK_EMAIL_PASS=your_outlook_password
   
   For Yahoo:
   YAHOO_EMAIL_PASS=your_yahoo_password

3. Run this test: node test-email.js

4. Check your test email inbox for the emails

Note: Only test with email addresses you actually have credentials for.
Remove or comment out email addresses you don't want to test.
`); 