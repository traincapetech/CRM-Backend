const cors = require('cors');

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://traincapecrm.traincapetech.in',
  'http://traincapecrm.traincapetech.in',
  'https://crm-backend-o36v.onrender.com',
  // Add any additional origins here
];

// CORS middleware with detailed logging for debugging
const corsMiddleware = cors({
  origin: function (origin, callback) {
    // Log the origin for debugging
    console.log('Request origin:', origin);
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('Request has no origin, allowing');
      return callback(null, true);
    }
    
    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      console.log('Origin allowed:', origin);
      return callback(null, true);
    }
    
    // For development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode - allowing all origins');
      return callback(null, true);
    }
    
    // For production but in debugging mode, allow all origins temporarily
    const debugCORS = process.env.DEBUG_CORS === 'true';
    if (debugCORS) {
      console.log('Debug CORS enabled - allowing origin:', origin);
      return callback(null, true);
    }
    
    // Otherwise, block the request
    console.log('CORS blocked request from:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 204,
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Origin', 
    'X-Requested-With', 
    'Accept',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Headers',
    'Access-Control-Allow-Methods'
  ],
  exposedHeaders: ['Content-Length', 'X-Content-Type-Options']
});

// Secondary middleware to ensure headers are always set
const ensureCorsHeaders = (req, res, next) => {
  const origin = req.headers.origin;
  
  // Always set these headers for allowed origins or in development
  if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development' || process.env.DEBUG_CORS === 'true') {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, X-Requested-With, Accept');
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request for:', req.url);
    return res.status(204).send();
  }
  
  next();
};

module.exports = {
  corsMiddleware,
  ensureCorsHeaders,
  handleOptions: (req, res) => {
    console.log('Explicit OPTIONS handler called for:', req.url);
    const origin = req.headers.origin;
    
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development' || process.env.DEBUG_CORS === 'true') {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, X-Requested-With, Accept');
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    
    res.status(204).send();
  }
}; 