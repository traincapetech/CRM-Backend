const Task = require('../models/Task');
const nodemailer = require('nodemailer');

// Configure nodemailer with environment variables
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Sends an email notification
 */
const sendEmailNotification = async (task) => {
  try {
    // Get customer and sales person details
    await task.populate([
      { path: 'customer', select: 'name NAME email E-MAIL contactNumber phone MOBILE' },
      { path: 'salesPerson', select: 'fullName email' }
    ]);

    // Get emails for notification
    const salesPersonEmail = task.salesPerson.email;
    const customerEmail = task.customer.email || task.customer["E-MAIL"];
    const customerName = task.customer.name || task.customer.NAME || 'Customer';
    const customerPhone = task.customer.contactNumber || task.customer.phone || task.customer.MOBILE || 'No contact number';
    
    if (!salesPersonEmail) {
      console.log('Sales person email not available, cannot send notifications');
      return;
    }

    const examTime = new Date(task.examDate).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    // Email to sales person (always sent regardless of customer email)
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@traincapecrm.com',
      to: salesPersonEmail,
      subject: `Reminder: ${customerName}'s exam today at ${examTime}`,
      html: `
        <h1>Exam Reminder</h1>
        <p>Dear ${task.salesPerson.fullName},</p>
        <p>This is a reminder that ${customerName}'s exam is scheduled for today at <strong>${examTime}</strong>.</p>
        <p>Please ensure all preparations are complete.</p>
        <p><strong>Exam Details:</strong> ${task.description || 'No additional details provided'}</p>
        <p><strong>Contact:</strong> ${customerPhone}</p>
      `
    });
    
    console.log(`Reminder email sent to sales person: ${salesPersonEmail}`);

    // Only send to customer if they have an email
    if (customerEmail) {
      // Email to customer
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@traincapecrm.com',
        to: customerEmail,
        subject: `Reminder: Your exam is scheduled for today at ${examTime}`,
        html: `
          <h1>Exam Reminder</h1>
          <p>Dear ${customerName},</p>
          <p>This is a reminder that your exam is scheduled for today at <strong>${examTime}</strong>.</p>
          <p>If you have any questions, please contact your sales representative: ${task.salesPerson.fullName}</p>
          <p>Best of luck with your exam!</p>
        `
      });
      console.log(`Reminder email sent to customer: ${customerEmail}`);
    } else {
      console.log('Customer email not available, skipping customer notification');
    }
    
    // Update the remindersSent array
    task.remindersSent.push(new Date());
    await task.save();
  } catch (error) {
    console.error('Error sending email notification:', error);
  }
};

/**
 * Checks for exams scheduled today and sends reminders
 * This function should be called hourly
 */
exports.processExamReminders = async () => {
  try {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Find all exams scheduled for today that haven't been completed
    const todaysExams = await Task.find({
      taskType: 'Exam',
      examDate: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      completed: false
    });
    
    console.log(`Found ${todaysExams.length} exams scheduled for today`);
    
    // For each exam, check if a reminder should be sent this hour
    for (const task of todaysExams) {
      const examTime = new Date(task.examDate);
      const hoursDifference = Math.floor((examTime - now) / (1000 * 60 * 60));
      
      // If the exam is scheduled within the next hour or has already started in the last hour
      if (hoursDifference <= 1 && hoursDifference >= -1) {
        // Check if we've already sent a reminder in the past hour
        const lastHour = new Date(now);
        lastHour.setHours(now.getHours() - 1);
        
        const recentReminder = task.remindersSent.some(date => date > lastHour);
        
        if (!recentReminder) {
          console.log(`Sending reminder for task ${task._id}, exam time: ${examTime}`);
          await sendEmailNotification(task);
        }
      }
    }
  } catch (error) {
    console.error('Error processing exam reminders:', error);
  }
}; 