const cron = require('node-cron');
const nodemailer = require('nodemailer');
const Task = require('../models/Task');

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || 'noreply@traincapetech.in',
    pass: process.env.EMAIL_PASS
  }
});

// Function to send exam reminder email
const sendExamReminderEmail = async (userEmail, userName, examDetails) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER || 'noreply@traincapetech.in',
      to: userEmail,
      subject: '🚨 Exam Reminder - 10 Minutes to Go!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
          <div style="background-color: #dc3545; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🚨 EXAM ALERT 🚨</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #dc3545; margin-top: 0;">Hi ${userName},</h2>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; font-size: 18px; font-weight: bold; color: #856404;">
                ⏰ Your exam starts in 10 minutes!
              </p>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #495057;">Exam Details:</h3>
              <p><strong>📚 Course:</strong> ${examDetails.course}</p>
              <p><strong>📅 Date:</strong> ${examDetails.date}</p>
              <p><strong>⏰ Time:</strong> ${examDetails.time}</p>
              <p><strong>📍 Location:</strong> ${examDetails.location || 'Online'}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${examDetails.examLink || '#'}" 
                 style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                🚀 Start Exam Now
              </a>
            </div>
            
            <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #0c5460;">📋 Quick Checklist:</h4>
              <ul style="margin: 10px 0; padding-left: 20px; color: #0c5460;">
                <li>✅ Stable internet connection</li>
                <li>✅ Quiet environment</li>
                <li>✅ Required materials ready</li>
                <li>✅ Browser updated and tested</li>
              </ul>
            </div>
            
            <p style="color: #6c757d; font-size: 14px; margin-top: 30px;">
              Good luck with your exam! 🍀<br>
              <strong>TrainCape Technology Team</strong>
            </p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Exam reminder email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error('Error sending exam reminder email:', error);
    return false;
  }
};

// Function to send WebSocket notification
const sendWebSocketNotification = (io, userId, examDetails) => {
  try {
    const notification = {
      type: 'exam-reminder',
      userId: userId,
      title: '🚨 Exam Starting Soon!',
      message: `Your ${examDetails.course} exam starts in 10 minutes!`,
      examDetails: examDetails,
      sound: true,
      priority: 'high',
      timestamp: new Date().toISOString()
    };

    // Send to user's personal room
    io.to(`user-${userId}`).emit('exam-reminder', notification);
    console.log(`WebSocket notification sent to user ${userId}`);
    return true;
  } catch (error) {
    console.error('Error sending WebSocket notification:', error);
    return false;
  }
};

// Function to check for upcoming exams and send notifications
const checkUpcomingExams = async (io) => {
  try {
    console.log('🔍 Checking for upcoming exams...');
    
    const now = new Date();
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);
    const elevenMinutesFromNow = new Date(now.getTime() + 11 * 60 * 1000);
    
    // Find tasks that are exams and start between 10-11 minutes from now
    const upcomingExams = await Task.find({
      taskType: 'Exam',
      examDateTime: {
        $gte: tenMinutesFromNow,
        $lt: elevenMinutesFromNow
      },
      reminderSent: { $ne: true } // Only send reminder once
    }).populate('assignedTo', 'fullName email');
    
    console.log(`📋 Found ${upcomingExams.length} upcoming exams`);
    
    for (const exam of upcomingExams) {
      if (!exam.assignedTo) {
        console.log(`⚠️ Skipping exam ${exam._id} - no assigned user`);
        continue;
      }
      
      const examDetails = {
        course: exam.course,
        date: exam.examDateTime.toLocaleDateString(),
        time: exam.examDateTime.toLocaleTimeString(),
        location: exam.location || 'Online',
        examLink: exam.examLink || '#'
      };
      
      console.log(`📧 Sending notifications for exam: ${exam.course} to ${exam.assignedTo.fullName}`);
      
      // Send email notification
      const emailSent = await sendExamReminderEmail(
        exam.assignedTo.email,
        exam.assignedTo.fullName,
        examDetails
      );
      
      // Send WebSocket notification
      const socketSent = sendWebSocketNotification(io, exam.assignedTo._id, examDetails);
      
      // Mark reminder as sent
      if (emailSent || socketSent) {
        await Task.findByIdAndUpdate(exam._id, { reminderSent: true });
        console.log(`✅ Reminder sent for exam ${exam._id}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking upcoming exams:', error);
  }
};

// Set up cron job to check every minute for upcoming exams
const startExamNotificationScheduler = (io) => {
  console.log('🚀 Starting exam notification scheduler...');
  
  // Run every minute
  cron.schedule('* * * * *', () => {
    checkUpcomingExams(io);
  });
  
  // Also run once at startup
  setTimeout(() => {
    checkUpcomingExams(io);
  }, 5000); // Wait 5 seconds after startup
};

module.exports = {
  startExamNotificationScheduler,
  sendExamReminderEmail,
  sendWebSocketNotification,
  checkUpcomingExams
}; 