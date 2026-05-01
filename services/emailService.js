const { sendEmail } = require("../config/nodemailer");
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
// Salary Payout Notification Email
const sendSalaryPayoutEmail = async (employee, payroll) => {
  try {
    if (!employee || !employee.email) {
      console.log("❌ Employee email not available for Salary Payout notification");
      return { success: false, message: "Employee email not available" };
    }

    const senderEmail = process.env.ACCOUNTS_EMAIL || process.env.HR_EMAIL || process.env.EMAIL_USER;
    if (!senderEmail) {
      console.warn("⚠️ No sender email configured for Salary Payout notification.");
    }
    
    const transporter = createTransporter(senderEmail || "accounts@traincapetech.in");

    const isSuccess = payroll.paytmPayoutStatus === "SUCCESS";
    const statusColor = isSuccess ? "#16a34a" : "#dc2626";
    const statusText = isSuccess ? "Successfully Processed" : "Failed / Action Required";

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: ${statusColor}; text-align: center;">Salary Payout Notification</h2>
        
        <p>Dear ${employee.fullName},</p>
        
        <p>This is to inform you about the status of your salary payout for <strong>${payroll.monthName} ${payroll.year}</strong>.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; margin: 20px 0; border-radius: 6px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px 0; color: #64748b; width: 40%;">Status:</td>
              <td style="padding: 5px 0; color: ${statusColor}; font-weight: bold;">${statusText}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #64748b;">Amount:</td>
              <td style="padding: 5px 0; font-weight: bold;">₹${(payroll.netSalary || 0).toLocaleString('en-IN')}</td>
            </tr>
            ${isSuccess && payroll.paytmTransactionId ? `
            <tr>
              <td style="padding: 5px 0; color: #64748b;">Reference ID:</td>
              <td style="padding: 5px 0; font-family: monospace;">${payroll.paytmTransactionId}</td>
            </tr>
            ` : ""}
            <tr>
              <td style="padding: 5px 0; color: #64748b;">Payment Mode:</td>
              <td style="padding: 5px 0;">${employee.paymentMode || "Bank Transfer"}</td>
            </tr>
          </table>
        </div>

        ${isSuccess ? `
          <p>The funds have been transferred to your registered ${employee.paymentMode === 'UPI' ? 'UPI ID' : 'Bank Account'}. It may take some time to reflect in your statement depending on your bank's processing time.</p>
        ` : `
          <p style="color: #991b1b; font-weight: bold;">Unfortunately, the automated transaction could not be completed. Our accounts team has been notified and they will work to resolve this manually or retry the transaction shortly.</p>
        `}
        
        <p>If you have any questions, please contact the HR or Accounts department.</p>
        
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">
          This is an automated message from Traincape Technology Pvt Ltd CRM.<br>
          © ${new Date().getFullYear()} Traincape CRM
        </p>
      </div>
    `;

    const mailOptions = {
      from: `"Traincape Accounts" <${senderEmail || "accounts@traincapetech.in"}>`,
      to: employee.email,
      subject: `${isSuccess ? "✅" : "⚠️"} Salary Payout Status: ${payroll.monthName} ${payroll.year}`,
      html: emailHtml,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Salary payout email (${payroll.paytmPayoutStatus}) sent to ${employee.email}`);

    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("❌ Error sending salary payout email:", error);
    return { success: false, error: error.message };
  }
};

// Send Welcome Email with Login Credentials
const sendWelcomeEmail = async (user, password, personalEmail) => {
  try {
    const recipientEmail = personalEmail || user.email;
    console.log(`DEBUG: Preparing welcome email for ${user.fullName} to be sent to ${recipientEmail}`);
    
    if (!recipientEmail) {
      console.log("❌ Recipient email not available for Welcome email");
      return { success: false, message: "Recipient email not available" };
    }

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin: 0; font-size: 28px;">Welcome to Traincape!</h1>
          <p style="color: #64748b; font-size: 16px; margin-top: 10px;">We're excited to have you on board.</p>
        </div>
        
        <p style="font-size: 16px; color: #1e293b;">Dear <strong>${user.fullName}</strong>,</p>
        
        <p style="font-size: 16px; color: #475569; line-height: 1.6;">Your employee account has been successfully created. Please use your **Official Company Email** to log in to the Traincape CRM.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 25px; margin: 30px 0; border-radius: 8px;">
          <h3 style="margin-top: 0; color: #1e293b; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Login Credentials</h3>
          <table style="width: 100%; margin-top: 15px;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; width: 35%;"><strong>Official Email:</strong></td>
              <td style="padding: 8px 0; color: #1e293b; font-family: monospace; font-size: 16px;">${user.email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;"><strong>Password:</strong></td>
              <td style="padding: 8px 0; color: #1e293b; font-family: monospace; font-size: 16px;">${password}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;"><strong>Portal URL:</strong></td>
              <td style="padding: 8px 0;"><a href="https://traincapecrm.traincapetech.in/" style="color: #2563eb; text-decoration: none; font-weight: 500;">crm.traincapetech.in</a></td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin: 35px 0;">
          <a href="https://traincapecrm.traincapetech.in/login" style="background-color: #2563eb; color: #ffffff; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block; transition: background-color 0.3s;">Log In to Your Account</a>
        </div>
        
        <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e; font-size: 14px;"><strong>Security Tip:</strong> Use your official company email for all CRM activities. Please change your password after your first login.</p>
        </div>

        <p style="font-size: 14px; color: #64748b; line-height: 1.5;">If you have any trouble logging in, please contact the IT support team or your manager.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;">
        
        <div style="text-align: center;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">
            This is an automated message from Traincape Technology Pvt Ltd.<br>
            Please do not reply to this email.
          </p>
        </div>
      </div>
    `;

    const subject = `Welcome to the Team! Your Official Account is Ready`;
    const result = await sendEmail(recipientEmail, subject, "", emailHtml);
    console.log(`✅ Welcome email send result for ${recipientEmail}:`, result);

    return { success: result };
  } catch (error) {
    console.error("❌ Error sending welcome email:", error);
    return { success: false, error: error.message };
  }
};

// ── Onboarding: Invite email ───────────────────────────────────────────────
const sendOnboardingInviteEmail = async ({
  candidateName, candidateEmail, portalUrl, expiryHours = 72,
  joiningDate, invitedByName, isResend = false,
}) => {
  try {
    const dateStr = joiningDate ? new Date(joiningDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "To be confirmed";
    const subject = isResend
      ? `Action Required: Complete Your Joining Process (New Link)`
      : `Complete Your Joining Process — Traincape Technology`;

    const html = `
      <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
        <div style="background:linear-gradient(135deg,#1e40af,#7c3aed);padding:40px 32px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700">Welcome to Traincape Technology!</h1>
          <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px">Your joining process is ready to begin</p>
        </div>
        <div style="padding:32px">
          <p style="font-size:16px;color:#1e293b">Dear <strong>${candidateName}</strong>,</p>
          <p style="color:#475569;line-height:1.7">Congratulations! You've been selected to join <strong>Traincape Technology Pvt Ltd</strong>. Please complete your onboarding by filling out the secure form below.</p>
          <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:24px 0;border-left:4px solid #1e40af">
            <p style="margin:0 0 6px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Expected Joining Date</p>
            <p style="margin:0;color:#1e293b;font-size:18px;font-weight:700">${dateStr}</p>
          </div>
          <div style="text-align:center;margin:32px 0">
            <a href="${portalUrl}" style="background:linear-gradient(135deg,#1e40af,#7c3aed);color:#fff;padding:16px 36px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;display:inline-block">
              Complete My Onboarding →
            </a>
          </div>
          <div style="background:#fef3c7;border-radius:8px;padding:16px;border:1px solid #fcd34d">
            <p style="margin:0;color:#92400e;font-size:13px">⏰ <strong>This link expires in ${expiryHours} hours.</strong> Please complete as soon as possible. If expired, contact HR for a new link.</p>
          </div>
          <p style="color:#64748b;font-size:13px;margin-top:24px">This invite was sent by <strong>${invitedByName}</strong> from Traincape HR team.</p>
        </div>
        <div style="background:#f8fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0">
          <p style="margin:0;color:#94a3b8;font-size:12px">Traincape Technology Pvt Ltd | hr@traincapetech.in</p>
        </div>
      </div>`;

    await sendEmail(candidateEmail, subject, "", html);
    return { success: true };
  } catch (error) {
    console.error("sendOnboardingInviteEmail error:", error.message);
    return { success: false, error: error.message };
  }
};

// ── Onboarding: Approval/Confirmation email ───────────────────────────────
const sendOnboardingApprovalEmail = async ({
  candidateName, candidateEmail, joiningDate, joiningTime, branchLocation,
}) => {
  try {
    const dateStr = joiningDate ? new Date(joiningDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "As discussed";
    const subject = `Congratulations! Your Joining at Traincape Has Been Confirmed`;
    const html = `
      <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
        <div style="background:linear-gradient(135deg,#059669,#0d9488);padding:40px 32px;text-align:center">
          <div style="font-size:48px">🎉</div>
          <h1 style="color:#fff;margin:8px 0 0;font-size:24px">Joining Confirmed!</h1>
        </div>
        <div style="padding:32px">
          <p style="font-size:16px;color:#1e293b">Dear <strong>${candidateName}</strong>,</p>
          <p style="color:#475569;line-height:1.7">We're thrilled to confirm your joining at <strong>Traincape Technology Pvt Ltd</strong>. Your documents have been reviewed and approved.</p>
          <div style="background:#f0fdf4;border-radius:8px;padding:20px;margin:24px 0;border:1px solid #86efac">
            <table style="width:100%">
              <tr><td style="color:#64748b;font-size:14px;padding:6px 0"><strong>Date:</strong></td><td style="color:#1e293b;font-size:14px">${dateStr}</td></tr>
              <tr><td style="color:#64748b;font-size:14px;padding:6px 0"><strong>Time:</strong></td><td style="color:#1e293b;font-size:14px">${joiningTime || "As communicated"}</td></tr>
              <tr><td style="color:#64748b;font-size:14px;padding:6px 0"><strong>Location:</strong></td><td style="color:#1e293b;font-size:14px">${branchLocation || "As communicated"}</td></tr>
            </table>
          </div>
          <p style="color:#64748b;font-size:14px">You will receive your login credentials and offer letter on your joining day. Please keep your original documents ready.</p>
        </div>
        <div style="background:#f8fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0">
          <p style="margin:0;color:#94a3b8;font-size:12px">Traincape Technology Pvt Ltd | hr@traincapetech.in</p>
        </div>
      </div>`;
    await sendEmail(candidateEmail, subject, "", html);
    return { success: true };
  } catch (error) {
    console.error("sendOnboardingApprovalEmail error:", error.message);
    return { success: false, error: error.message };
  }
};

// ── Onboarding: Day-before reminder ──────────────────────────────────────
const sendJoiningReminderEmail = async ({
  candidateName, candidateEmail, joiningDate, joiningTime, branchLocation,
  reportingManagerName, reportingManagerEmail,
}) => {
  try {
    const subject = `Reminder: Your Joining at Traincape is Tomorrow!`;
    const html = `
      <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
        <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:40px 32px;text-align:center">
          <div style="font-size:48px">⏰</div>
          <h1 style="color:#fff;margin:8px 0 0;font-size:22px">Your joining is tomorrow!</h1>
        </div>
        <div style="padding:32px">
          <p style="font-size:16px;color:#1e293b">Dear <strong>${candidateName}</strong>,</p>
          <p style="color:#475569">This is a friendly reminder that you are joining Traincape Technology tomorrow.</p>
          <div style="background:#fffbeb;border-radius:8px;padding:20px;margin:20px 0;border:1px solid #fcd34d">
            <h3 style="margin:0 0 12px;color:#92400e">📋 Day 1 Details</h3>
            <table style="width:100%">
              <tr><td style="color:#78350f;font-size:14px;padding:5px 0"><strong>Date:</strong></td><td style="color:#1c1917;font-size:14px">${new Date(joiningDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</td></tr>
              <tr><td style="color:#78350f;font-size:14px;padding:5px 0"><strong>Reporting Time:</strong></td><td style="color:#1c1917;font-size:14px">${joiningTime || "9:00 AM"}</td></tr>
              <tr><td style="color:#78350f;font-size:14px;padding:5px 0"><strong>Location:</strong></td><td style="color:#1c1917;font-size:14px">${branchLocation || "Office"}</td></tr>
              <tr><td style="color:#78350f;font-size:14px;padding:5px 0"><strong>Reporting To:</strong></td><td style="color:#1c1917;font-size:14px">${reportingManagerName || "HR Team"}</td></tr>
            </table>
          </div>
          <div style="background:#eff6ff;border-radius:8px;padding:16px;border:1px solid #bfdbfe">
            <p style="margin:0 0 8px;font-weight:600;color:#1e40af">📂 Documents to Carry (Originals)</p>
            <ul style="margin:0;padding-left:20px;color:#1e3a8a;font-size:14px">
              <li>Aadhaar Card</li><li>PAN Card</li><li>Educational Certificates</li>
              <li>Experience Letters (if any)</li><li>2 Passport Photos</li><li>Bank Account Details</li>
            </ul>
          </div>
          ${reportingManagerEmail ? `<p style="color:#64748b;font-size:13px;margin-top:16px">📧 Contact: <a href="mailto:${reportingManagerEmail}">${reportingManagerEmail}</a></p>` : ""}
        </div>
        <div style="background:#f8fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0">
          <p style="margin:0;color:#94a3b8;font-size:12px">Traincape Technology Pvt Ltd | hr@traincapetech.in</p>
        </div>
      </div>`;
    await sendEmail(candidateEmail, subject, "", html);
    return { success: true };
  } catch (error) {
    console.error("sendJoiningReminderEmail error:", error.message);
    return { success: false, error: error.message };
  }
};

// ── Onboarding: Joining day welcome (credentials) ─────────────────────────
const sendJoiningDayWelcomeEmail = async ({ user, employee, password, reportingManagerId }) => {
  try {
    let managerName = "Your Manager";
    if (reportingManagerId) {
      const User = require("../models/User");
      const mgr = await User.findById(reportingManagerId).select("fullName");
      if (mgr) managerName = mgr.fullName;
    }
    const crmUrl = process.env.CLIENT_URL || "https://traincapecrm.traincapetech.in";
    const subject = `Welcome to Traincape Technology — Your Account is Ready!`;
    const html = `
      <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
        <div style="background:linear-gradient(135deg,#1e40af,#7c3aed);padding:40px 32px;text-align:center">
          <div style="font-size:48px">🚀</div>
          <h1 style="color:#fff;margin:8px 0 0;font-size:24px">Welcome to the Team!</h1>
        </div>
        <div style="padding:32px">
          <p style="font-size:16px;color:#1e293b">Dear <strong>${user.fullName}</strong>,</p>
          <p style="color:#475569;line-height:1.7">Welcome aboard! Your official account is ready. Below are your login credentials:</p>
          <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:20px 0;border:1px solid #e2e8f0">
            <h3 style="margin:0 0 12px;color:#1e293b">🔐 Login Credentials</h3>
            <table style="width:100%">
              <tr><td style="color:#64748b;padding:6px 0;font-size:14px"><strong>Email:</strong></td><td style="color:#1e293b;font-family:monospace">${user.email}</td></tr>
              <tr><td style="color:#64748b;padding:6px 0;font-size:14px"><strong>Password:</strong></td><td style="color:#1e293b;font-family:monospace;font-weight:700">${password}</td></tr>
              <tr><td style="color:#64748b;padding:6px 0;font-size:14px"><strong>Portal:</strong></td><td><a href="${crmUrl}" style="color:#1e40af">${crmUrl}</a></td></tr>
              <tr><td style="color:#64748b;padding:6px 0;font-size:14px"><strong>Reporting To:</strong></td><td style="color:#1e293b">${managerName}</td></tr>
            </table>
          </div>
          <div style="text-align:center;margin:24px 0">
            <a href="${crmUrl}/login" style="background:linear-gradient(135deg,#1e40af,#7c3aed);color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block">Log In to CRM →</a>
          </div>
          <div style="background:#fef3c7;border-radius:8px;padding:14px;border:1px solid #fcd34d">
            <p style="margin:0;color:#92400e;font-size:13px">🔒 Please change your password after first login. Keep credentials confidential.</p>
          </div>
        </div>
        <div style="background:#f8fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0">
          <p style="margin:0;color:#94a3b8;font-size:12px">Traincape Technology Pvt Ltd | hr@traincapetech.in</p>
        </div>
      </div>`;
    await sendEmail(user.email, subject, "", html);
    return { success: true };
  } catch (error) {
    console.error("sendJoiningDayWelcomeEmail error:", error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendPaymentConfirmationEmail,
  sendServiceDeliveryEmail,
  sendPIPNotification,
  sendTicketCreatedEmail,
  sendTicketAssignedEmail,
  sendTicketStatusUpdateEmail,
  sendSalaryPayoutEmail,
  sendWelcomeEmail,
  sendOnboardingInviteEmail,
  sendOnboardingApprovalEmail,
  sendJoiningReminderEmail,
  sendJoiningDayWelcomeEmail,
};
