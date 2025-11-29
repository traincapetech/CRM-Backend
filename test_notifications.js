const mongoose = require('mongoose');
const Task = require('./models/Task');
const User = require('./models/User');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function createTestExam() {
  try {
    // Find a user to assign the exam to
    const user = await User.findOne();
    
    if (!user) {
      console.log('No users found in database');
      return;
    }

    // Create exam date/time - 2 minutes from now
    const examDateTime = new Date();
    examDateTime.setMinutes(examDateTime.getMinutes() + 2);

    // Create test exam task
    const examTask = new Task({
      title: 'Test Notification Exam',
      description: 'React Development Certification Exam - Testing notification system',
      taskType: 'Exam',
      course: 'React Development',
      location: 'Online',
      examLink: 'https://example.com/exam-portal',
      examDate: examDateTime,
      examDateTime: examDateTime,
      assignedTo: user._id,
      salesPerson: user._id,
      reminderSent: false,
      manualCustomer: {
        name: 'Test Customer',
        email: 'test@example.com',
        contactNumber: '+1234567890',
        course: 'React Development'
      }
    });

    await examTask.save();

    console.log('✅ Test exam created successfully!');
    console.log(`📅 Exam scheduled for: ${examDateTime.toLocaleString()}`);
    console.log(`👤 Assigned to: ${user.fullName} (${user.email})`);
    console.log(`🔔 Notifications will be sent at:`);
    console.log(`   - 30 minutes before: ${new Date(examDateTime.getTime() - 30 * 60 * 1000).toLocaleString()}`);
    console.log(`   - Exam time: ${examDateTime.toLocaleString()}`);
    console.log(`   - 10 minutes after: ${new Date(examDateTime.getTime() + 10 * 60 * 1000).toLocaleString()}`);
    console.log(`\n🎯 Since this exam is in 2 minutes, you should receive an "exam-time" notification soon!`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating test exam:', error);
    process.exit(1);
  }
}

createTestExam(); 