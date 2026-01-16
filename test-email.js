require('dotenv').config();
const { sendEmail } = require('./config/nodemailer');

async function testEmail() {
  console.log('═══════════════════════════════════════════════');
  console.log('📧 Testing Hostinger Email Configuration');
  console.log('═══════════════════════════════════════════════\n');

  console.log('Configuration:');
  console.log('  ├─ Email User:', process.env.EMAIL_USER || 'crm@traincapetech.in');
  console.log('  ├─ SMTP Host: smtp.hostinger.com');
  console.log('  ├─ SMTP Port: 587');
  console.log('  ├─ Encryption: STARTTLS');
  console.log('  └─ Password:', process.env.EMAIL_PASS ? '✓ Set' : '✗ Not Set\n');

  if (!process.env.EMAIL_PASS) {
    console.error('\n❌ ERROR: EMAIL_PASS not set in .env file!');
    console.log('\nPlease add to your .env file:');
    console.log('EMAIL_USER=crm@traincapetech.in');
    console.log('EMAIL_PASS=your_password_here\n');
    process.exit(1);
  }

  const testRecipient = process.env.TEST_EMAIL || 'your-email@example.com';
  
  console.log('\n📨 Sending test email to:', testRecipient);
  console.log('⏳ Please wait...\n');

  try {
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #2563eb; text-align: center;">✅ Email Configuration Test Successful</h2>
        
        <p>Dear Team,</p>
        
        <p>This is a <strong>test email</strong> from your Traincape CRM system using Hostinger SMTP.</p>
        
        <div style="background-color: #f0f9ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1e40af;">Configuration Details:</h3>
          <ul style="list-style: none; padding-left: 0;">
            <li>📧 <strong>From:</strong> ${process.env.EMAIL_USER || 'crm@traincapetech.in'}</li>
            <li>🌐 <strong>SMTP Host:</strong> smtp.hostinger.com</li>
            <li>🔌 <strong>Port:</strong> 587 (STARTTLS)</li>
            <li>⏰ <strong>Sent At:</strong> ${new Date().toLocaleString()}</li>
          </ul>
        </div>
        
        <p>If you received this email, your SMTP configuration is working correctly! ✅</p>
        
        <p><strong>Features Working:</strong></p>
        <ul>
          <li>✓ Forgot Password OTP emails</li>
          <li>✓ Payment confirmation emails</li>
          <li>✓ Service delivery notifications</li>
          <li>✓ Lead reminders</li>
        </ul>
        
        <hr style="margin: 20px 0;">
        <p style="font-size: 12px; color: #666; text-align: center;">
          This is an automated test message from <strong>Traincape CRM</strong><br>
          Powered by Hostinger Email Services
        </p>
      </div>
    `;

    const emailText = `
Email Configuration Test Successful!

This is a test email from your Traincape CRM system using Hostinger SMTP.

Configuration Details:
- From: ${process.env.EMAIL_USER || 'crm@traincapetech.in'}
- SMTP Host: smtp.hostinger.com
- Port: 587 (STARTTLS)
- Sent At: ${new Date().toLocaleString()}

If you received this email, your SMTP configuration is working correctly!

Features Working:
✓ Forgot Password OTP emails
✓ Payment confirmation emails
✓ Service delivery notifications
✓ Lead reminders

---
This is an automated test message from Traincape CRM
Powered by Hostinger Email Services
    `;

    await sendEmail(
      testRecipient,
      '✅ CRM Email Configuration Test - Hostinger SMTP',
      emailText,
      emailHtml
    );

    console.log('═══════════════════════════════════════════════');
    console.log('✅ SUCCESS! Email sent successfully!');
    console.log('═══════════════════════════════════════════════\n');
    
    console.log('✓ SMTP connection established');
    console.log('✓ Authentication successful');
    console.log('✓ Email delivered to:', testRecipient);
    console.log('\n📬 Check your inbox (and spam folder) for the test email.\n');
    
    console.log('Next Steps:');
    console.log('  1. Verify email arrived in inbox');
    console.log('  2. Test forgot password on frontend');
    console.log('  3. Update Render environment variables');
    console.log('  4. Deploy and test in production\n');

    process.exit(0);
  } catch (error) {
    console.log('═══════════════════════════════════════════════');
    console.error('❌ FAILED! Email test failed');
    console.log('═══════════════════════════════════════════════\n');
    
    console.error('Error Details:');
    console.error('  ├─ Message:', error.message);
    console.error('  ├─ Code:', error.code || 'N/A');
    console.error('  └─ Response:', error.response || 'N/A\n');

    console.log('Troubleshooting:');
    
    if (error.code === 'EAUTH' || error.message.includes('authentication')) {
      console.log('  🔐 Authentication Error:');
      console.log('     - Verify EMAIL_PASS is correct in .env');
      console.log('     - Check if email account is active in Hostinger');
      console.log('     - Try generating an App Password');
    } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      console.log('  ⏱️  Connection Timeout:');
      console.log('     - Check your internet connection');
      console.log('     - Verify firewall is not blocking port 587');
      console.log('     - Try using port 465 instead');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('  🚫 Connection Refused:');
      console.log('     - Verify SMTP host is smtp.hostinger.com');
      console.log('     - Check if SMTP service is enabled');
      console.log('     - Contact Hostinger support');
    } else {
      console.log('  ⚠️  Unknown Error:');
      console.log('     - Check server logs for more details');
      console.log('     - Verify all environment variables are set');
      console.log('     - Contact support if issue persists');
    }
    
    console.log('\nFor more help, check: HOSTINGER_EMAIL_SETUP.md\n');
    process.exit(1);
  }
}

// Run the test
testEmail();
