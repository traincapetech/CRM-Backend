const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const cors = require('cors');
const connectDB = require('./config/db');
// const ipFilter = require('./middleware/ipFilter');
// Load env vars
dotenv.config();

// Connect to database
console.log('Connecting to CRM database...');
connectDB();

// Use the IP filter middleware
// app.use(ipFilter);

// Route files
const authRoutes = require('./routes/auth');
const leadRoutes = require('./routes/leads');
const saleRoutes = require('./routes/sales');
const leadSalesRoutes = require('./routes/leadSalesRoute');
const currencyRoutes = require('./routes/currency');
const taskRoutes = require('./routes/taskRoutes');
const app = express();

// Reminder service
const { processExamReminders } = require('./utils/reminderService');

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Enable CORS with configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://traincapecrm.traincapetech.in',
      'http://traincapecrm.traincapetech.in',
      'https://crm-backend-o36v.onrender.com'
    ];
    
    // For debugging - log all origins
    console.log('Request origin:', origin);
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked request from:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/lead-sales', leadSalesRoutes);
app.use('/api/currency', currencyRoutes);
app.use('/api/tasks', taskRoutes);


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

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Set up the reminder scheduler - run every 10 minutes
const REMINDER_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds
setInterval(() => {
  console.log('Running exam reminder scheduler...');
  processExamReminders();
}, REMINDER_INTERVAL);

// Also run once at startup
console.log('Initial run of exam reminder scheduler...');
processExamReminders();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
}); 