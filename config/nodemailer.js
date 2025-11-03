const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true, // use SSL
  auth: {
    user: process.env.EMAIL_USER || 'sales@traincapetech.in',
    pass: process.env.EMAIL_PASS || 'Canada@1212'
  },
  connectionTimeout: 30000, // 30 seconds - increased for better reliability
  greetingTimeout: 30000, // 30 seconds
  socketTimeout: 30000, // 30 seconds
  pool: true, // Use connection pooling
  maxConnections: 5,
  maxMessages: 100,
  // Add retry options
  retry: true,
  // Debug options (only in development)
  debug: process.env.NODE_ENV === 'development',
  logger: process.env.NODE_ENV === 'development'
});

const sendEmail = async (to, subject, text, html, retries = 2) => {
  console.log('Attempting to send email:', {
    to,
    subject,
    from: process.env.EMAIL_USER || 'sales@traincapetech.in',
    retries: retries
  });
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const mailOptions = {
        from: `"Traincape CRM" <${process.env.EMAIL_USER || 'sales@traincapetech.in'}>`,
        to,
        subject,
        text,
        html
      };

      // For the last attempt, use a longer timeout
      const timeout = attempt === retries ? 60000 : 30000; // 60s for final attempt, 30s for retries
      
      const info = await Promise.race([
        transporter.sendMail(mailOptions),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Email send timeout')), timeout)
        )
      ]);
      
      console.log('Email sent successfully:', info.messageId);
      return true;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      
      console.error(`Email send attempt ${attempt + 1}/${retries + 1} failed:`, {
        message: error.message,
        code: error.code,
        command: error.command,
        response: error.response
      });
      
      // If it's the last attempt, throw the error
      if (isLastAttempt) {
        // Provide more helpful error message
        let errorMessage = 'Failed to send email';
        if (error.code === 'ETIMEDOUT' || error.message === 'Email send timeout') {
          errorMessage = 'Email server connection timeout. Please try again later or contact support.';
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Email server connection refused. Please contact support.';
        } else if (error.response) {
          errorMessage = `Email server error: ${error.response}`;
        }
        
        const emailError = new Error(errorMessage);
        emailError.originalError = error;
        throw emailError;
      }
      
      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Max 5 seconds
      console.log(`Retrying email send in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

module.exports = { sendEmail };
