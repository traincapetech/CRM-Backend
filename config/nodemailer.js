const nodemailer = require('nodemailer');
const axios = require('axios');

// Try port 465 (SSL) first, fallback to 587 (STARTTLS)
const createTransporter = (config) => {
  // Security: Email credentials must be set in environment variables
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('FATAL: EMAIL_USER and EMAIL_PASS environment variables are required');
  }

  return nodemailer.createTransport(config);
};

const smtpConfigs = [
  {
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true, // SSL for port 465
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: false
    }
  },
  {
    host: 'smtp.hostinger.com',
    port: 587,
    secure: false, // STARTTLS for port 587
    requireTLS: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: false
    }
  }
];

const getBrevoApiKey = () => {
  const rawKey =
    process.env.BREVO_API_KEY ||
    process.env.SENDINBLUE_API_KEY ||
    process.env.SIB_API_KEY ||
    '';
  return rawKey.trim();
};

const sendViaBrevo = async ({ to, subject, text, html }) => {
  const apiKey = getBrevoApiKey();
  if (!apiKey) return false;

  const fromEmail = process.env.FROM_EMAIL || process.env.EMAIL_USER;
  const fromName = process.env.FROM_NAME || 'Traincape CRM';

  if (!fromEmail) {
    throw new Error('FATAL: FROM_EMAIL or EMAIL_USER is required for Brevo');
  }

  const payload = {
    sender: { email: fromEmail, name: fromName },
    to: [{ email: to }],
    subject,
    textContent: text,
    htmlContent: html
  };

  await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });

  return true;
};

const sendEmail = async (to, subject, text, html, retries = 2) => {
  console.log('Attempting to send email:', {
    to,
    subject,
    from: process.env.FROM_EMAIL || process.env.EMAIL_USER,
    retries: retries,
    provider: getBrevoApiKey() ? 'brevo' : 'smtp',
    smtpConfig: {
      host: 'smtp.hostinger.com',
      port: smtpConfigs[0].port,
      secure: smtpConfigs[0].secure
    }
  });

  if (getBrevoApiKey()) {
    try {
      await sendViaBrevo({ to, subject, text, html });
      console.log('✅ Email sent successfully via Brevo');
      return true;
    } catch (error) {
      const brevoStatus = error.response?.status;
      const brevoCode = error.response?.data?.code;
      if (brevoStatus === 401 || brevoStatus === 403 || brevoCode === 'unauthorized') {
        throw new Error('Brevo authorization failed. Check BREVO_API_KEY.');
      }
      console.error('❌ Brevo send failed, falling back to SMTP:', {
        message: error.response?.data || error.message
      });
      // Fall back to SMTP below
    }
  }
  
  // Create fresh transporter for each email to avoid connection issues
  let currentTransporter = createTransporter(smtpConfigs[0]);
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const mailOptions = {
        from: `"${process.env.FROM_NAME || 'Traincape CRM'}" <${process.env.FROM_EMAIL || process.env.EMAIL_USER}>`,
        to,
        subject,
        text,
        html
      };

      const smtpConfig = smtpConfigs[attempt % smtpConfigs.length];
      console.log(`📧 Email send attempt ${attempt + 1}/${retries + 1} (port ${smtpConfig.port})...`);
      
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
      
      // Create new transporter for next attempt (rotate ports)
      const nextConfig = smtpConfigs[(attempt + 1) % smtpConfigs.length];
      currentTransporter = createTransporter(nextConfig);
      
      // Wait before retrying (exponential backoff)
      const delay = Math.min(2000 * Math.pow(2, attempt), 10000); // Start with 2s, max 10s
      console.log(`⏳ Retrying email send in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

module.exports = { sendEmail };
