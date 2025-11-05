const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const cors = require('cors');
const connectDB = require('./config/db');
const { corsMiddleware, ensureCorsHeaders, handleOptions } = require('./middleware/cors');
const ipFilter = require('./middleware/ipFilter');
const http = require('http');
const socketIo = require('socket.io');
// Load env vars
dotenv.config();

// Debug environment variables
console.log('Environment:', {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET ? 'Set' : 'Not set',
  JWT_EXPIRE: process.env.JWT_EXPIRE
});

// Set DEBUG_CORS in development for testing
if (process.env.NODE_ENV === 'development') {
  process.env.DEBUG_CORS = 'true';
}

// Connect to database
console.log('Connecting to CRM database...');
connectDB();

// Use the IP filter middleware
// app.use(ipFilter);

// Route files
const authRoutes = require('./routes/auth');
const leadRoutes = require('./routes/leads');
const salesRoutes = require('./routes/sales');
const leadSalesRoutes = require('./routes/leadSalesRoute');
const leadPersonSalesRoutes = require('./routes/leadPersonSales');
const currencyRoutes = require('./routes/currency');
const tasksRoutes = require('./routes/tasks');
const testExamRoutes = require('./routes/testExamNotifications');
const chatRoutes = require('./routes/chat');
const prospectRoutes = require('./routes/prospects');
const activityRoutes = require('./routes/activity');
const employeeRoutes = require('./routes/employees');
const leaveRoutes = require('./routes/leaves');
const attendanceRoutes = require('./routes/attendance');
const payrollRoutes = require('./routes/payroll');
const incentivesRoutes = require('./routes/incentives');
const documentationRoutes = require('./routes/documentation');
const invoiceRoutes = require('./routes/invoices');
const stripeInvoiceRoutes = require('./routes/stripeInvoices');
const logs = require('./routes/logs');
const itProjectsRoutes = require('./routes/itProjects');
const app = express();
const server = http.createServer(app);

// Socket.IO setup with CORS
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://traincapecrm.traincapetech.in"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Make io available to other modules
app.set('io', io);

// Chat service for Socket.IO
const ChatService = require('./services/chatService');

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Check if this is a guest connection
  const isGuest = socket.handshake.query.isGuest === 'true';
  const guestId = socket.handshake.query.guestId;
  
  if (isGuest) {
    console.log('Guest connected:', guestId);
    
    // Handle guest joining their room
    socket.on('join-guest-room', (guestId) => {
      socket.join(`guest-${guestId}`);
      console.log(`Guest ${guestId} joined their room`);
    });
    
    // Handle guest requesting support team
    socket.on('get-support-team', async () => {
      try {
        const User = require('./models/User');
        const supportTeam = await User.find({ 
          role: { $in: ['Admin', 'Manager', 'Sales Person', 'Lead Person'] },
          chatStatus: 'ONLINE'
        }).select('fullName role chatStatus');
        
        socket.emit('support-team-list', supportTeam);
      } catch (error) {
        console.error('Error getting support team:', error);
      }
    });
    
    // Handle guest messages
    socket.on('guest-message', async (data) => {
      try {
        const { guestId, guestInfo, recipientId, content, timestamp } = data;
        
        // Create a guest message object
        const guestMessage = {
          id: Date.now(),
          guestId,
          guestInfo,
          content,
          timestamp,
          sender: 'guest'
        };
        
        // Send to support team member
        if (recipientId !== 'offline') {
          io.to(`user-${recipientId}`).emit('guest-message-received', {
            ...guestMessage,
            sender: 'guest',
            senderName: guestInfo.name,
            senderEmail: guestInfo.email
          });
          
          // Send notification
          io.to(`user-${recipientId}`).emit('messageNotification', {
            senderId: guestId,
            senderName: `${guestInfo.name} (Guest)`,
            content: content,
            timestamp: timestamp,
            isGuest: true
          });
        }
        
        // Confirm message received
        socket.emit('guest-message-sent', guestMessage);
        
      } catch (error) {
        console.error('Error handling guest message:', error);
        socket.emit('guest-message-error', { error: error.message });
      }
    });
    
    // Handle support team responding to guest
    socket.on('respond-to-guest', (data) => {
      const { guestId, content, senderName, timestamp } = data;
      
      io.to(`guest-${guestId}`).emit('guest-message-received', {
        id: Date.now(),
        content,
        sender: 'support',
        senderName,
        timestamp: new Date(timestamp)
      });
    });
    
  } else {
    // Regular user connection handling
    
    // Join user to their personal room for targeted notifications
    socket.on('join-user-room', (userId) => {
      socket.join(`user-${userId}`);
      console.log(`User ${userId} joined their room`);
      
      // Update user status to online
      ChatService.updateUserStatus(userId, 'ONLINE').catch(console.error);
      
      // Broadcast user status update
      socket.broadcast.emit('userStatusUpdate', {
        userId,
        status: 'ONLINE',
        lastSeen: new Date()
      });
    });

    // Handle chat message sending via Socket.IO
    socket.on('sendMessage', async (data) => {
      try {
        const { senderId, recipientId, content, messageType = 'text' } = data;
        
        const message = await ChatService.saveMessage({
          senderId,
          recipientId,
          content,
          messageType
        });

        // Send to recipient
        io.to(`user-${recipientId}`).emit('newMessage', {
          _id: message._id,
          chatId: message.chatId,
          senderId: message.senderId,
          recipientId: message.recipientId,
          content: message.content,
          messageType: message.messageType,
          timestamp: message.timestamp,
          isRead: message.isRead
        });

        // Send confirmation to sender
        socket.emit('messageDelivered', {
          _id: message._id,
          timestamp: message.timestamp
        });

        // Send notification to recipient
        io.to(`user-${recipientId}`).emit('messageNotification', {
          senderId: message.senderId,
          senderName: message.senderId.fullName,
          content: message.content,
          timestamp: message.timestamp
        });
      } catch (error) {
        console.error('Error sending message via socket:', error);
        socket.emit('messageError', { error: error.message });
      }
    });

    // Handle typing indicators
    socket.on('typing', (data) => {
      const { recipientId, isTyping } = data;
      io.to(`user-${recipientId}`).emit('userTyping', {
        senderId: data.senderId,
        isTyping
      });
    });

    // Handle user status updates
    socket.on('updateStatus', async (data) => {
      try {
        const { userId, status } = data;
        await ChatService.updateUserStatus(userId, status);
        
        // Broadcast status update to all users
        io.emit('userStatusUpdate', {
          userId,
          status,
          lastSeen: new Date()
        });
      } catch (error) {
        console.error('Error updating user status:', error);
      }
    });
  }
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Note: We can't easily get userId from socket on disconnect
    // This would need to be handled by storing userId in socket data
    // For now, we'll rely on the frontend to send status updates
  });
});

// Reminder service
const { processExamReminders } = require('./utils/reminderService');
const { startExamNotificationScheduler } = require('./utils/examNotificationService');

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Enable CORS with our custom middleware
app.use(corsMiddleware);

// Add a pre-flight route handler for OPTIONS requests
app.options('*', handleOptions);

// IP Filter - Restrict access to office network only
// Enable via ENABLE_IP_FILTER=true and configure ALLOWED_IP_RANGES in .env
app.use(ipFilter);

// Add second layer of CORS protection to ensure headers are set
app.use(ensureCorsHeaders);

// Add a specific route for CORS preflight that always succeeds
app.options('/api/*', handleOptions);

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/lead-sales', leadSalesRoutes);
app.use('/api/lead-person-sales', leadPersonSalesRoutes);
app.use('/api/currency', currencyRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/test-exam', testExamRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/prospects', prospectRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/incentives', incentivesRoutes);
app.use('/api/documentation', documentationRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/stripe-invoices', stripeInvoiceRoutes);
app.use('/api/logs', logs);
app.use('/api/it-projects', itProjectsRoutes);

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to CRM API',
    environment: process.env.NODE_ENV,
    version: '1.0.0'
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  
  // Start the exam notification scheduler
  startExamNotificationScheduler(io);
});

// Set up the reminder scheduler - run every 10 minutes
const REMINDER_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds
setInterval(() => {
  console.log('Running exam reminder scheduler...');
  processExamReminders(io);
}, REMINDER_INTERVAL);

// Also run once at startup
console.log('Initial run of exam reminder scheduler...');
processExamReminders(io);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
}); 