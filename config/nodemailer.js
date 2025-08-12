const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true, // use SSL
  auth: {
    user: process.env.EMAIL_USER || 'sales@traincapetech.in',
    pass: process.env.EMAIL_PASS || 'Canada@1212'
  }
});

const sendEmail = async (to, subject, text, html) => {
  console.log('Attempting to send email:', {
    to,
    subject,
    from: process.env.EMAIL_USER || 'sales@traincapetech.in'
  });
  try {
    const mailOptions = {
      from: `"Traincape CRM" <${process.env.EMAIL_USER || 'sales@traincapetech.in'}>`,
      to,
      subject,
      text,
      html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response
    });
    throw error;
  }
};

module.exports = { sendEmail };
