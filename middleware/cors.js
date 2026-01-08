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
    
    // For development, allow localhost origins only
    if (process.env.NODE_ENV === 'development') {
      if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        console.log('Development mode - allowing localhost origin:', origin);
        return callback(null, true);
      }
    }
    
    // Security: DEBUG_CORS removed - use allowedOrigins list only
    // If you need to add a new origin, add it to the allowedOrigins array above
    
    // Block all other requests
    console.log('CORS blocked request from:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 204,
  preflightContinue: false, // Let cors handle preflight
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
  exposedHeaders: ['Content-Length', 'X-Content-Type-Options'],
  maxAge: 86400 // Cache preflight for 24 hours
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
    
    // Always allow preflight for allowed origins
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development' || process.env.DEBUG_CORS === 'true') {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, X-Requested-With, Accept');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', '86400'); // Cache for 24 hours
      return res.status(204).send();
    }
    
    // Block if origin not allowed
    console.log('CORS preflight blocked for origin:', origin);
    res.status(403).json({ success: false, message: 'CORS policy: Origin not allowed' });
  }
}; 