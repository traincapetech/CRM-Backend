const nodemailer = require('nodemailer');

// Email provider configurations
const getEmailConfig = (email) => {
  const domain = email.split('@')[1].toLowerCase();
  
  // Hostinger email configuration
  if (domain === 'traincapetech.in' || domain.includes('hostinger')) {
    return {
      host: 'smtp.hostinger.com',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: email,
        pass: process.env.HOSTINGER_EMAIL_PASS || process.env.EMAIL_PASS
      }
    };
  }
  
  // Gmail configuration
  if (domain === 'gmail.com') {
    return {
      service: 'gmail',
      auth: {
        user: email,
        pass: process.env.GMAIL_APP_PASS || process.env.EMAIL_PASS
      }
    };
  }
  
  // Outlook/Hotmail configuration
  if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com') {
    return {
      service: 'hotmail',
      auth: {
        user: email,
        pass: process.env.OUTLOOK_EMAIL_PASS || process.env.EMAIL_PASS
      }
    };
  }
  
  // Yahoo configuration
  if (domain === 'yahoo.com' || domain === 'yahoo.in') {
    return {
      service: 'yahoo',
      auth: {
        user: email,
        pass: process.env.YAHOO_EMAIL_PASS || process.env.EMAIL_PASS
      }
    };
  }
  
  // Generic SMTP configuration (fallback)
  return {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: email,
      pass: process.env.EMAIL_PASS
    }
  };
};

// Create transporter based on sender email
const createTransporter = (senderEmail) => {
  const config = getEmailConfig(senderEmail);
  return nodemailer.createTransporter(config);
};

// Payment confirmation email template
const getPaymentConfirmationTemplate = (data) => {
  const { customerName, tokenAmount, currency, course, totalCost, pendingAmount, paymentDate } = data;
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: #2563eb; text-align: center;">Payment Confirmation</h2>
      
      <p>Dear ${customerName},</p>
      
      <p><strong>Warm Greetings!</strong></p>
      
      <p>We earnestly acknowledge your payment of <strong>${tokenAmount} ${currency}</strong> received through UPI ahead savings account on ${paymentDate} for <strong>${course}</strong> service delivery.</p>
      
      <p>Thank you for trusting <strong>Traincape Technology Pvt Ltd</strong> ahead for your certification process.</p>
      
      <p>Please note, your next installment for the payment will be <strong>${pendingAmount} ${currency}</strong> after service delivery.</p>
      
      <p>We look forward to offering you our best services and to continue being in business with you in the long run.</p>
      
      <p>If we can be of any further assistance, please do not hesitate to contact me.</p>
      
      <p><strong>We appreciate your business</strong></p>
      
      <hr style="margin: 20px 0;">
      <p style="font-size: 12px; color: #666;">
        This is an automated message from Traincape Technology Pvt Ltd.<br>
        Total Course Amount: ${totalCost} ${currency}<br>
        Token Amount Paid: ${tokenAmount} ${currency}<br>
        Pending Amount: ${pendingAmount} ${currency}
      </p>
    </div>
  `;
};

// Service delivery email template
const getServiceDeliveryTemplate = (data) => {
  const { customerName, totalCost, currency, course, paymentDate } = data;
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: #16a34a; text-align: center;">Service Delivery Confirmation</h2>
      
      <p>Dear ${customerName},</p>
      
      <p><strong>Warm Greetings!</strong></p>
      
      <p>We earnestly acknowledge your payment of <strong>${totalCost} ${currency}</strong> received through Stripe on ${paymentDate} for <strong>${course}</strong> service delivery.</p>
      
      <p>Thank you for trusting <strong>Traincape Technology Pvt Ltd</strong> ahead for your certification process.</p>
      
      <p>We look forward to offering you our best services and to continue being in business with you in the long run.</p>
      
      <p>If we can be of any further assistance, please do not hesitate to contact me.</p>
      
      <p><strong>We appreciate your business</strong></p>
      
      <hr style="margin: 20px 0;">
      <p style="font-size: 12px; color: #666;">
        This is an automated message from Traincape Technology Pvt Ltd.<br>
        Course: ${course}<br>
        Total Amount: ${totalCost} ${currency}<br>
        Status: Service Delivered
      </p>
    </div>
  `;
};

// Send payment confirmation email
const sendPaymentConfirmationEmail = async (saleData, salesPersonEmail) => {
  try {
    // Validate inputs
    if (!salesPersonEmail) {
      console.log('❌ Sales person email not available');
      return { success: false, message: 'Sales person email not available' };
    }
    
    if (!saleData.email) {
      console.log('❌ Customer email unavailable for:', saleData.customerName);
      return { success: false, message: 'Customer email not available' };
    }
    
    const transporter = createTransporter(salesPersonEmail);
    
    const pendingAmount = (saleData.totalCost || 0) - (saleData.tokenAmount || 0);
    const paymentDate = new Date(saleData.date || Date.now()).toLocaleDateString();
    
    const emailData = {
      customerName: saleData.customerName,
      tokenAmount: saleData.tokenAmount || 0,
      currency: saleData.totalCostCurrency || saleData.currency || 'USD',
      course: saleData.course,
      totalCost: saleData.totalCost || 0,
      pendingAmount: pendingAmount,
      paymentDate: paymentDate
    };
    
    const mailOptions = {
      from: `"Traincape Technology" <${salesPersonEmail}>`,
      to: saleData.email,
      cc: salesPersonEmail, // CC the sales person
      subject: `Payment Confirmation - ${saleData.course} - ${saleData.customerName}`,
      html: getPaymentConfirmationTemplate(emailData)
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Payment confirmation email sent:', result.messageId);
    
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Error sending payment confirmation email:', error);
    
    // Provide specific error messages based on error type
    let errorMessage = 'Failed to send payment confirmation email';
    if (error.code === 'EAUTH') {
      errorMessage = 'Email authentication failed - check email credentials';
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'Email server connection failed';
    } else if (error.responseCode === 535) {
      errorMessage = 'Invalid email credentials';
    }
    
    return { success: false, error: errorMessage };
  }
};

// Send service delivery email
const sendServiceDeliveryEmail = async (saleData, salesPersonEmail) => {
  try {
    // Validate inputs
    if (!salesPersonEmail) {
      console.log('❌ Sales person email not available');
      return { success: false, message: 'Sales person email not available' };
    }
    
    if (!saleData.email) {
      console.log('❌ Customer email unavailable for:', saleData.customerName);
      return { success: false, message: 'Customer email not available' };
    }
    
    const transporter = createTransporter(salesPersonEmail);
    
    const paymentDate = new Date(saleData.date || Date.now()).toLocaleDateString();
    
    const emailData = {
      customerName: saleData.customerName,
      totalCost: saleData.totalCost || 0,
      currency: saleData.totalCostCurrency || saleData.currency || 'USD',
      course: saleData.course,
      paymentDate: paymentDate
    };
    
    const mailOptions = {
      from: `"Traincape Technology" <${salesPersonEmail}>`,
      to: saleData.email,
      cc: salesPersonEmail, // CC the sales person
      subject: `Service Delivery Confirmation - ${saleData.course} - ${saleData.customerName}`,
      html: getServiceDeliveryTemplate(emailData)
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Service delivery email sent:', result.messageId);
    
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Error sending service delivery email:', error);
    
    // Provide specific error messages based on error type
    let errorMessage = 'Failed to send service delivery email';
    if (error.code === 'EAUTH') {
      errorMessage = 'Email authentication failed - check email credentials';
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'Email server connection failed';
    } else if (error.responseCode === 535) {
      errorMessage = 'Invalid email credentials';
    }
    
    return { success: false, error: errorMessage };
  }
};

module.exports = {
  sendPaymentConfirmationEmail,
  sendServiceDeliveryEmail
}; 