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

const app = express();

// Body parser
app.use(express.json());

// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Enable CORS with configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'https://traincapecrm.traincapetech.in',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/sales', saleRoutes);

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

const PORT = process.env.PORT || 5050;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
}); 