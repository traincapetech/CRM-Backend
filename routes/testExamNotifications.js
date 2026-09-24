const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const User = require('../models/User');
const { checkUpcomingExams } = require('../utils/examNotificationService');

// @route   POST /api/test/create-exam
// @desc    Create a test exam task for notification testing
// @access  Private (for testing only)
router.post('/create-exam', async (req, res) => {
  try {
    const { 
      course = 'Test Course',
      minutesFromNow = 11, // Default to 11 minutes from now (will trigger in 1 minute)
      userEmail 
    } = req.body;

    // Find a user to assign the exam to
    let assignedUser;
    if (userEmail) {
      assignedUser = await User.findOne({ email: userEmail });
    } else {
      // Find any user for testing
      assignedUser = await User.findOne();
    }

    if (!assignedUser) {
      return res.status(400).json({
        success: false,
        message: 'No user found to assign the exam to'
      });
    }

    // Create exam date/time
    const examDateTime = new Date();
    examDateTime.setMinutes(examDateTime.getMinutes() + minutesFromNow);

    // Create test exam task
    const examTask = new Task({
      title: `Test Exam - ${course}`,
      description: `This is a test exam for ${course} to test the notification system`,
      taskType: 'Exam',
      course: course,
      location: 'Online Test Environment',
      examLink: 'https://example.com/exam-portal',
      examDate: examDateTime,
      examDateTime: examDateTime,
      assignedTo: assignedUser._id,
      salesPerson: assignedUser._id,
      reminderSent: false
    });

    await examTask.save();

    res.status(201).json({
      success: true,
      message: `Test exam created successfully! Notification will be sent at ${new Date(examDateTime.getTime() - 10 * 60 * 1000).toLocaleString()}`,
      data: {
        examId: examTask._id,
        course: examTask.course,
        examDateTime: examTask.examDateTime,
        assignedTo: {
          name: assignedUser.fullName,
          email: assignedUser.email
        },
        notificationTime: new Date(examDateTime.getTime() - 10 * 60 * 1000)
      }
    });

  } catch (error) {
    console.error('Error creating test exam:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating test exam',
      error: error.message
    });
  }
});

// @route   POST /api/test/trigger-notifications
// @desc    Manually trigger notification check (for testing)
// @access  Private (for testing only)
router.post('/trigger-notifications', async (req, res) => {
  try {
    const io = req.app.get('io');
    
    if (!io) {
      return res.status(500).json({
        success: false,
        message: 'Socket.IO not available'
      });
    }

    // Manually trigger the notification check
    await checkUpcomingExams(io);

    res.json({
      success: true,
      message: 'Notification check triggered successfully'
    });

  } catch (error) {
    console.error('Error triggering notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error triggering notifications',
      error: error.message
    });
  }
});

// @route   GET /api/test/upcoming-exams
// @desc    Get upcoming exams for testing
// @access  Private (for testing only)
router.get('/upcoming-exams', async (req, res) => {
  try {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    const upcomingExams = await Task.find({
      taskType: 'Exam',
      examDateTime: {
        $gte: now,
        $lte: oneHourFromNow
      }
    }).populate('assignedTo', 'fullName email');

    res.json({
      success: true,
      count: upcomingExams.length,
      data: upcomingExams.map(exam => ({
        id: exam._id,
        course: exam.course,
        examDateTime: exam.examDateTime,
        assignedTo: exam.assignedTo ? {
          name: exam.assignedTo.fullName,
          email: exam.assignedTo.email
        } : null,
        reminderSent: exam.reminderSent,
        minutesUntilExam: Math.round((exam.examDateTime - now) / (1000 * 60))
      }))
    });

  } catch (error) {
    console.error('Error fetching upcoming exams:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching upcoming exams',
      error: error.message
    });
  }
});

// @route   DELETE /api/test/cleanup-test-exams
// @desc    Clean up test exam tasks
// @access  Private (for testing only)
router.delete('/cleanup-test-exams', async (req, res) => {
  try {
    const result = await Task.deleteMany({
      title: { $regex: /^Test Exam/ }
    });

    res.json({
      success: true,
      message: `Cleaned up ${result.deletedCount} test exam tasks`
    });

  } catch (error) {
    console.error('Error cleaning up test exams:', error);
    res.status(500).json({
      success: false,
      message: 'Error cleaning up test exams',
      error: error.message
    });
  }
});

module.exports = router; 