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
 * @param {Object} task - The task object
 * @param {string} reminderType - Type of reminder (30-minute-before, exam-time, 10-minute-after)
 */
const sendEmailNotification = async (task, reminderType = 'exam-time') => {
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
    
    const examDate = new Date(task.examDate).toLocaleDateString([], {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    // Customize content based on reminder type
    let salesPersonSubject, salesPersonContent, customerSubject, customerContent;
    
    switch (reminderType) {
      case '30-minute-before':
        salesPersonSubject = `UPCOMING: ${customerName}'s exam in 30 minutes (${examTime})`;
        salesPersonContent = `
          <h1>Exam Starting Soon - 30 Minute Notice</h1>
          <p>Dear ${task.salesPerson.fullName},</p>
          <p>This is a reminder that ${customerName}'s exam is scheduled to start in <strong>30 minutes</strong> at <strong>${examTime}</strong> on ${examDate}.</p>
          <p>Please ensure all preparations are complete and systems are ready.</p>
          <p><strong>Exam Details:</strong> ${task.description || 'No additional details provided'}</p>
          <p><strong>Contact:</strong> ${customerPhone}</p>
        `;
        
        customerSubject = `REMINDER: Your exam begins in 30 minutes`;
        customerContent = `
          <h1>Your Exam Starts Soon</h1>
          <p>Dear ${customerName},</p>
          <p>This is a reminder that your exam is scheduled to start in <strong>30 minutes</strong> at <strong>${examTime}</strong>.</p>
          <p>Please ensure you are prepared and ready to begin.</p>
          <p>If you have any questions, please contact your sales representative: ${task.salesPerson.fullName}</p>
          <p>Best of luck with your exam!</p>
        `;
        break;
        
      case 'exam-time':
        salesPersonSubject = `ALERT: ${customerName}'s exam is starting now (${examTime})`;
        salesPersonContent = `
          <h1>Exam Starting Now</h1>
          <p>Dear ${task.salesPerson.fullName},</p>
          <p>This is a notification that ${customerName}'s exam is scheduled to start <strong>right now</strong> at <strong>${examTime}</strong>.</p>
          <p>Please ensure the exam process is initiated and the customer is ready.</p>
          <p><strong>Exam Details:</strong> ${task.description || 'No additional details provided'}</p>
          <p><strong>Contact:</strong> ${customerPhone}</p>
        `;
        
        customerSubject = `ALERT: Your exam is starting now`;
        customerContent = `
          <h1>Your Exam Is Starting</h1>
          <p>Dear ${customerName},</p>
          <p>Your exam is scheduled to start <strong>right now</strong> at <strong>${examTime}</strong>.</p>
          <p>Please begin the exam process as instructed.</p>
          <p>If you have any technical issues, please contact your sales representative immediately: ${task.salesPerson.fullName}</p>
          <p>Good luck!</p>
        `;
        break;
        
      case '10-minute-after':
        salesPersonSubject = `FOLLOW-UP: ${customerName}'s exam started 10 minutes ago`;
        salesPersonContent = `
          <h1>Exam Follow-up Reminder</h1>
          <p>Dear ${task.salesPerson.fullName},</p>
          <p>This is a follow-up notification for ${customerName}'s exam that started 10 minutes ago at <strong>${examTime}</strong>.</p>
          <p>Please check if:</p>
          <ul>
            <li>The exam is progressing as expected</li>
            <li>The customer has encountered any issues</li>
            <li>You need to mark the task as completed when finished</li>
          </ul>
          <p><strong>Exam Details:</strong> ${task.description || 'No additional details provided'}</p>
          <p><strong>Contact:</strong> ${customerPhone}</p>
        `;
        
        // No customer notification for the 10-minute-after reminder
        customerSubject = null;
        customerContent = null;
        break;
        
      default:
        salesPersonSubject = `Reminder: ${customerName}'s exam at ${examTime}`;
        salesPersonContent = `
          <h1>Exam Reminder</h1>
          <p>Dear ${task.salesPerson.fullName},</p>
          <p>This is a reminder that ${customerName}'s exam is scheduled for today at <strong>${examTime}</strong>.</p>
          <p>Please ensure all preparations are complete.</p>
          <p><strong>Exam Details:</strong> ${task.description || 'No additional details provided'}</p>
          <p><strong>Contact:</strong> ${customerPhone}</p>
        `;
        
        customerSubject = `Reminder: Your exam is scheduled for today at ${examTime}`;
        customerContent = `
          <h1>Exam Reminder</h1>
          <p>Dear ${customerName},</p>
          <p>This is a reminder that your exam is scheduled for today at <strong>${examTime}</strong>.</p>
          <p>If you have any questions, please contact your sales representative: ${task.salesPerson.fullName}</p>
          <p>Best of luck with your exam!</p>
        `;
    }

    // Email to sales person (always sent regardless of customer email)
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@traincapecrm.com',
      to: salesPersonEmail,
      subject: salesPersonSubject,
      html: salesPersonContent
    });
    
    console.log(`${reminderType} reminder email sent to sales person: ${salesPersonEmail}`);

    // Only send to customer if they have an email and if there's content for this reminder type
    if (customerEmail && customerSubject && customerContent) {
      // Email to customer
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@traincapecrm.com',
        to: customerEmail,
        subject: customerSubject,
        html: customerContent
      });
      console.log(`${reminderType} reminder email sent to customer: ${customerEmail}`);
    } else if (!customerEmail) {
      console.log('Customer email not available, skipping customer notification');
    } else {
      console.log(`No customer notification configured for ${reminderType} reminder type`);
    }
    
    // Update the remindersSent array with type information
    task.remindersSent.push({
      sentAt: new Date(),
      reminderType: reminderType
    });
    await task.save();
  } catch (error) {
    console.error('Error sending email notification:', error);
  }
};

/**
 * Checks for exams scheduled today and sends reminders
 * This function is called every 10 minutes
 */
exports.processExamReminders = async () => {
  try {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Find all upcoming exams and recent exams that haven't been completed
    // Look for exams up to 24 hours ahead and up to 1 hour in the past
    const upcomingExams = await Task.find({
      taskType: 'Exam',
      examDate: {
        $gte: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
        $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours from now
      },
      completed: false
    });
    
    console.log(`Found ${upcomingExams.length} upcoming exams to check for reminders`);
    
    // For each exam, check if a reminder should be sent based on specific time triggers
    for (const task of upcomingExams) {
      const examTime = new Date(task.examDate);
      const minutesDifference = Math.round((examTime - now) / (1000 * 60));
      
      let shouldSendReminder = false;
      let reminderType = '';
      
      // Send reminders at these specific times:
      // 1. 30 minutes before the exam
      // 2. At exam time (0-5 minutes window)
      // 3. 10 minutes after exam start (reminder to mark complete)
      
      if (minutesDifference <= 30 && minutesDifference >= 25) {
        // 30 minutes before exam (with 5 min window)
        shouldSendReminder = true;
        reminderType = '30-minute-before';
      } else if (minutesDifference <= 5 && minutesDifference >= -5) {
        // At exam time (with 5 min window before and after)
        shouldSendReminder = true;
        reminderType = 'exam-time';
      } else if (minutesDifference <= -10 && minutesDifference >= -15) {
        // 10 minutes after exam (with 5 min window)
        shouldSendReminder = true;
        reminderType = '10-minute-after';
      }
      
      if (shouldSendReminder) {
        // Check if this specific reminder type was already sent
        const alreadySent = task.remindersSent.some(reminder => {
          // Get the sent date from the reminder object
          const sentDate = new Date(reminder.sentAt);
          const reminderTypeSent = reminder.reminderType;
          
          // If this is the same type of reminder...
          if (reminderTypeSent === reminderType) {
            // For the exam-time window, check if reminder was sent within last 10 minutes
            if (reminderType === 'exam-time') {
              return now.getTime() - sentDate.getTime() < 10 * 60 * 1000;
            }
            
            // For 30-minute-before, check if sent in last 30 minutes
            if (reminderType === '30-minute-before') {
              return now.getTime() - sentDate.getTime() < 30 * 60 * 1000;
            }
            
            // For 10-minute-after, check if sent in last 15 minutes
            if (reminderType === '10-minute-after') {
              return now.getTime() - sentDate.getTime() < 15 * 60 * 1000;
            }
            
            // For any other type, check if sent on the same day
            const sentDay = sentDate.toDateString();
            const today = now.toDateString();
            return sentDay === today;
          }
          
          return false; // Not the same type of reminder
        });
        
        if (!alreadySent) {
          console.log(`Sending ${reminderType} reminder for task ${task._id}, exam time: ${examTime}`);
          await sendEmailNotification(task, reminderType);
        }
      }
    }
  } catch (error) {
    console.error('Error processing exam reminders:', error);
  }
}; 