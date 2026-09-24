const axios = require("axios");

/**
 * Send email via Brevo (Sendinblue) API
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.htmlContent - HTML email body
 * @param {string} options.textContent - Plain text email body (optional)
 */
const sendEmail = async ({ to, subject, htmlContent, textContent }) => {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "crm@traincapetech.in";
  const fromName = process.env.FROM_NAME || "Traincape Technology";

  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured");
  }

  try {
    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { name: fromName, email: fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent,
        textContent: textContent || htmlContent.replace(/<[^>]*>/g, ""),
      },
      {
        headers: {
          accept: "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
        },
      },
    );

    console.log("Brevo email sent successfully:", response.data);
    return { success: true, messageId: response.data.messageId };
  } catch (error) {
    console.error("Brevo email error:", error.response?.data || error.message);
    throw new Error(error.response?.data?.message || "Failed to send email");
  }
};

/**
 * Send OTP email for password reset
 * @param {string} email - Recipient email
 * @param {string} otp - One-time password
 */
const sendPasswordResetOTP = async (email, otp) => {
  const subject = "Password Reset OTP - Traincape CRM";
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #152B54; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px; background: #f9f9f9; }
        .otp-box { 
          background: #152B54; 
          color: white; 
          font-size: 32px; 
          font-weight: bold; 
          text-align: center; 
          padding: 20px; 
          margin: 20px 0; 
          letter-spacing: 8px;
          border-radius: 8px;
        }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Traincape CRM</h1>
        </div>
        <div class="content">
          <h2>Password Reset Request</h2>
          <p>You have requested to reset your password. Use the OTP below to verify your identity:</p>
          <div class="otp-box">${otp}</div>
          <p><strong>This OTP will expire in 10 minutes.</strong></p>
          <p>If you did not request this password reset, please ignore this email or contact support if you have concerns.</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Traincape Technology. All rights reserved.</p>
          <p>This is an automated message, please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to: email, subject, htmlContent });
};

module.exports = {
  sendEmail,
  sendPasswordResetOTP,
};
