const nodemailer = require('nodemailer');

// Try port 587 with STARTTLS first (more compatible with Render/firewalls)
// Fallback to 465 with SSL if 587 doesn't work
const createTransporter = () => {
  // Primary: Port 587 with STARTTLS (recommended for Hostinger, better firewall compatibility)
  const config587 = {
    host: 'smtp.hostinger.com',
    port: 587,
    secure: false, // false for STARTTLS on port 587
    requireTLS: true, // Require TLS encryption
    auth: {
      user: process.env.EMAIL_USER || 'sales@traincapetech.in',
      pass: process.env.EMAIL_PASS || 'Canada@1212'
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: false // Allow self-signed certificates
    }
  };

  // Try port 587 first (better for cloud deployments)
  return nodemailer.createTransport(config587);
};

const transporter = createTransporter();

const sendEmail = async (to, subject, text, html, retries = 2) => {
  console.log('Attempting to send email:', {
    to,
    subject,
    from: process.env.EMAIL_USER || 'sales@traincapetech.in',
    retries: retries,
    smtpConfig: {
      host: 'smtp.hostinger.com',
      port: 587,
      secure: false
    }
  });
  
  // Create fresh transporter for each email to avoid connection issues
  let currentTransporter = createTransporter();
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const mailOptions = {
        from: `"Traincape CRM" <${process.env.EMAIL_USER || 'sales@traincapetech.in'}>`,
        to,
        subject,
        text,
        html
      };

      console.log(`📧 Email send attempt ${attempt + 1}/${retries + 1}...`);
      
      // Let nodemailer handle its own timeouts - don't race with custom timeout
      const info = await currentTransporter.sendMail(mailOptions);
      
      console.log('✅ Email sent successfully:', info.messageId);
      
      // Close connection after success
      if (currentTransporter.close) {
        currentTransporter.close();
      }
      
      return true;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      
      console.error(`❌ Email send attempt ${attempt + 1}/${retries + 1} failed:`, {
        message: error.message,
        code: error.code,
        command: error.command,
        response: error.response,
        syscall: error.syscall,
        address: error.address,
        port: error.port
      });
      
      // Close failed connection
      if (currentTransporter.close) {
        try {
          currentTransporter.close();
        } catch (e) {
          // Ignore errors when closing
        }
      }
      
      // If it's the last attempt, throw the error
      if (isLastAttempt) {
        // Provide more helpful error message
        let errorMessage = 'Failed to send email';
        if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
          errorMessage = 'Email server connection timeout. This may be due to network/firewall restrictions. Please try again later or contact support.';
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Email server connection refused. Please verify SMTP settings and contact support.';
        } else if (error.code === 'EAUTH') {
          errorMessage = 'Email authentication failed. Please verify email credentials.';
        } else if (error.response) {
          errorMessage = `Email server error: ${error.response}`;
        } else {
          errorMessage = `Email send failed: ${error.message}`;
        }
        
        const emailError = new Error(errorMessage);
        emailError.originalError = error;
        throw emailError;
      }
      
      // Create new transporter for next attempt
      currentTransporter = createTransporter();
      
      // Wait before retrying (exponential backoff)
      const delay = Math.min(2000 * Math.pow(2, attempt), 10000); // Start with 2s, max 10s
      console.log(`⏳ Retrying email send in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

module.exports = { sendEmail };
