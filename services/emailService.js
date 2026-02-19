const nodemailer = require("nodemailer");

// Email provider configurations
const getEmailConfig = (email) => {
  const domain = email.split("@")[1].toLowerCase();

  // Hostinger email configuration
  if (domain === "traincapetech.in" || domain.includes("hostinger")) {
    return {
      host: "smtp.hostinger.com",
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: email,
        pass: process.env.HOSTINGER_EMAIL_PASS || process.env.EMAIL_PASS,
      },
    };
  }

  // Gmail configuration
  if (domain === "gmail.com") {
    return {
      service: "gmail",
      auth: {
        user: email,
        pass: process.env.GMAIL_APP_PASS || process.env.EMAIL_PASS,
      },
    };
  }

  // Outlook/Hotmail configuration
  if (
    domain === "outlook.com" ||
    domain === "hotmail.com" ||
    domain === "live.com"
  ) {
    return {
      service: "hotmail",
      auth: {
        user: email,
        pass: process.env.OUTLOOK_EMAIL_PASS || process.env.EMAIL_PASS,
      },
    };
  }

  // Yahoo configuration
  if (domain === "yahoo.com" || domain === "yahoo.in") {
    return {
      service: "yahoo",
      auth: {
        user: email,
        pass: process.env.YAHOO_EMAIL_PASS || process.env.EMAIL_PASS,
      },
    };
  }

  // Generic SMTP configuration (fallback)
  return {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: email,
      pass: process.env.EMAIL_PASS,
    },
  };
};

// Create transporter based on sender email
const createTransporter = (senderEmail) => {
  const config = getEmailConfig(senderEmail);
  return nodemailer.createTransport(config);
};

// Payment confirmation email template
const getPaymentConfirmationTemplate = (data) => {
  const {
    customerName,
    tokenAmount,
    currency,
    course,
    totalCost,
    pendingAmount,
    paymentDate,
  } = data;

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
      console.log("❌ Sales person email not available");
      return { success: false, message: "Sales person email not available" };
    }

    if (!saleData.email) {
      console.log("❌ Customer email unavailable for:", saleData.customerName);
      return { success: false, message: "Customer email not available" };
    }

    const transporter = createTransporter(salesPersonEmail);

    const pendingAmount =
      (saleData.totalCost || 0) - (saleData.tokenAmount || 0);
    const paymentDate = new Date(
      saleData.date || Date.now(),
    ).toLocaleDateString();

    const emailData = {
      customerName: saleData.customerName,
      tokenAmount: saleData.tokenAmount || 0,
      currency: saleData.totalCostCurrency || saleData.currency || "USD",
      course: saleData.course,
      totalCost: saleData.totalCost || 0,
      pendingAmount: pendingAmount,
      paymentDate: paymentDate,
    };

    const mailOptions = {
      from: `"Traincape Technology" <${salesPersonEmail}>`,
      to: saleData.email,
      cc: salesPersonEmail, // CC the sales person
      subject: `Payment Confirmation - ${saleData.course} - ${saleData.customerName}`,
      html: getPaymentConfirmationTemplate(emailData),
    };

    const result = await transporter.sendMail(mailOptions);
    console.log("✅ Payment confirmation email sent:", result.messageId);

    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("❌ Error sending payment confirmation email:", error);

    // Provide specific error messages based on error type
    let errorMessage = "Failed to send payment confirmation email";
    if (error.code === "EAUTH") {
      errorMessage = "Email authentication failed - check email credentials";
    } else if (error.code === "ECONNECTION") {
      errorMessage = "Email server connection failed";
    } else if (error.responseCode === 535) {
      errorMessage = "Invalid email credentials";
    }

    return { success: false, error: errorMessage };
  }
};

// Send service delivery email
const sendServiceDeliveryEmail = async (saleData, salesPersonEmail) => {
  try {
    // Validate inputs
    if (!salesPersonEmail) {
      console.log("❌ Sales person email not available");
      return { success: false, message: "Sales person email not available" };
    }

    if (!saleData.email) {
      console.log("❌ Customer email unavailable for:", saleData.customerName);
      return { success: false, message: "Customer email not available" };
    }

    const transporter = createTransporter(salesPersonEmail);

    const paymentDate = new Date(
      saleData.date || Date.now(),
    ).toLocaleDateString();

    const emailData = {
      customerName: saleData.customerName,
      totalCost: saleData.totalCost || 0,
      currency: saleData.totalCostCurrency || saleData.currency || "USD",
      course: saleData.course,
      paymentDate: paymentDate,
    };

    const mailOptions = {
      from: `"Traincape Technology" <${salesPersonEmail}>`,
      to: saleData.email,
      cc: salesPersonEmail, // CC the sales person
      subject: `Service Delivery Confirmation - ${saleData.course} - ${saleData.customerName}`,
      html: getServiceDeliveryTemplate(emailData),
    };

    const result = await transporter.sendMail(mailOptions);
    console.log("✅ Service delivery email sent:", result.messageId);

    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("❌ Error sending service delivery email:", error);

    // Provide specific error messages based on error type
    let errorMessage = "Failed to send service delivery email";
    if (error.code === "EAUTH") {
      errorMessage = "Email authentication failed - check email credentials";
    } else if (error.code === "ECONNECTION") {
      errorMessage = "Email server connection failed";
    } else if (error.responseCode === 535) {
      errorMessage = "Invalid email credentials";
    }

    return { success: false, error: errorMessage };
  }
};

// Send PIP Notification Email
const sendPIPNotification = async (employee, pip, manager) => {
  try {
    if (!employee.email) {
      console.log("❌ Employee email not available for PIP notification");
      return { success: false, message: "Employee email not available" };
    }

    // Use manager's email as sender if available, otherwise use default
    const senderEmail =
      manager?.email ||
      process.env.HR_EMAIL ||
      process.env.ADMIN_EMAIL ||
      process.env.EMAIL_USER;

    if (!senderEmail) {
      console.warn(
        "⚠️ No sender email configure for PIP notification. Using noreply.",
      );
    }

    const transporter = createTransporter(
      senderEmail || "noreply@traincapetech.in",
    );

    const endDate = new Date(pip.endDate).toLocaleDateString();

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #dc2626; text-align: center;">Performance Improvement Plan Initiated</h2>
        
        <p>Dear ${employee.fullName},</p>
        
        <p>This email is to inform you that a <strong>Performance Improvement Plan (PIP)</strong> has been initiated for you, effective immediately.</p>
        
        <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #991b1b;"><strong>Reason:</strong> ${pip.triggerReason}</p>
          <p style="margin: 10px 0 0 0; color: #991b1b;"><strong>Duration:</strong> ${pip.duration} days (Ends: ${endDate})</p>
        </div>

        <p>This plan is designed to help you get back on track. Your manager will work with you to set specific goals and schedule weekly reviews.</p>
        
        <p><strong>Next Steps:</strong></p>
        <ul>
          <li>Review the PIP details in your dashboard.</li>
          <li>Schedule a meeting with your manager (${manager?.fullName || "Manager"}) to discuss goals.</li>
          <li>Commit to the weekly review process.</li>
        </ul>
        
        <p>We believe in your potential and want to see you succeed. Please treat this as an opportunity to focus on your professional growth.</p>
        
        <hr style="margin: 20px 0;">
        <p style="font-size: 12px; color: #666;">
          This is an automated message from the Performance Management System.<br>
          PIP ID: ${pip._id}
        </p>
      </div>
    `;

    const mailOptions = {
      from: `"Performance Management" <${senderEmail}>`,
      to: employee.email,
      cc: manager?.email, // CC the manager
      subject: `Action Required: Performance Improvement Plan Initiated`,
      html: emailHtml,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log("✅ PIP notification email sent:", result.messageId);

    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("❌ Error sending PIP notification email:", error);
    return { success: false, error: error.message };
  }
};

// Ticket Created Email (To User)
const sendTicketCreatedEmail = async (ticket, user) => {
  // Implementation for sending ticket creation confirmation
  // Note: detailed implementation omitted for brevity but logic is similar to others
  // Using generic sender if not specified
  const senderEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER;
  const transporter = createTransporter(senderEmail);

  const mailOptions = {
    from: `"Traincape Support" <${senderEmail}>`,
    to: user.email,
    subject: `[Ticket #${ticket._id}] received: ${ticket.title}`,
    html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Ticket Received</h2>
                <p>Hello ${user.fullName},</p>
                <p>We have received your ticket regarding "<strong>${ticket.title}</strong>".</p>
                <p>Ticket ID: ${ticket._id}</p>
                <p>Status: ${ticket.status}</p>
                <p>Priority: ${ticket.priority}</p>
                <p>Our team will review it shortly.</p>
            </div>
        `,
  };
  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending ticket created email:", error);
  }
};

// Ticket Assigned Email (To Assignee)
const sendTicketAssignedEmail = async (ticket, assignee, assigner) => {
  const senderEmail = assigner?.email || process.env.EMAIL_USER;
  const transporter = createTransporter(senderEmail);

  const mailOptions = {
    from: `"Traincape CRM" <${senderEmail}>`,
    to: assignee.email,
    subject: `New Ticket Assigned: ${ticket.title}`,
    html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>New Ticket Assignment</h2>
                <p>Hello ${assignee.fullName},</p>
                <p>You have been assigned a new ticket.</p>
                <p><strong>Title:</strong> ${ticket.title}</p>
                <p><strong>Priority:</strong> ${ticket.priority}</p>
                <p><strong>Due Date:</strong> ${ticket.dueDate ? new Date(ticket.dueDate).toLocaleDateString() : "N/A"}</p>
                <p>Please check the dashboard for details.</p>
            </div>
        `,
  };
  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending ticket assigned email:", error);
  }
};

// Ticket Status Update Email (To User)
const sendTicketStatusUpdateEmail = async (ticket, user) => {
  const senderEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER;
  const transporter = createTransporter(senderEmail);

  const mailOptions = {
    from: `"Traincape Support" <${senderEmail}>`,
    to: user.email,
    subject: `[Ticket #${ticket._id}] Status Update: ${ticket.status}`,
    html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Ticket Updated</h2>
                <p>Hello ${user.fullName},</p>
                <p>Your ticket "<strong>${ticket.title}</strong>" has been updated.</p>
                <p><strong>New Status:</strong> ${ticket.status}</p>
                <p>Log in to view the latest updates.</p>
            </div>
        `,
  };
  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending ticket status email:", error);
  }
};
module.exports = {
  sendPaymentConfirmationEmail,
  sendServiceDeliveryEmail,
  sendPIPNotification,
  sendTicketCreatedEmail,
  sendTicketAssignedEmail,
  sendTicketStatusUpdateEmail,
};
