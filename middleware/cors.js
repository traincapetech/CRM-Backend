const cors = require('cors');

const staticAllowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://traincapecrm.traincapetech.in',
  'http://traincapecrm.traincapetech.in',
  'https://crm-backend-o36v.onrender.com',
  // Add any additional origins here
];

const envAllowedOrigins = [
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  process.env.ALLOWED_ORIGINS
]
  .filter(Boolean)
  .flatMap((value) => value.split(',').map((origin) => origin.trim()))
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...staticAllowedOrigins, ...envAllowedOrigins]));

// Helper function to check if origin is allowed
const isOriginAllowed = (origin) => {
  if (!origin) return true; // Allow requests with no origin
  
  if (allowedOrigins.includes(origin)) return true;

  // Allow any subdomain on traincapetech.in
  if (/^https?:\/\/([a-z0-9-]+\.)?traincapetech\.in$/i.test(origin)) {
    return true;
  }
  
  // For development, allow localhost origins
  if (process.env.NODE_ENV === 'development') {
    if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      return true;
    }
  }
  
  return false;
};

// CORS middleware with detailed logging for debugging
const corsMiddleware = cors({
  origin: function (origin, callback) {
    // Log the origin for debugging
    console.log('🌐 CORS Request origin:', origin || 'no origin');
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('✅ CORS: Request has no origin, allowing');
      return callback(null, true);
    }
    
    // Check if origin is allowed
    if (isOriginAllowed(origin)) {
      console.log('✅ CORS: Origin allowed:', origin);
      return callback(null, true);
    }
    
    // Block all other requests
    console.log('❌ CORS blocked request from:', origin);
    console.log('📋 Allowed origins:', allowedOrigins);
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
  exposedHeaders: ['Content-Length', 'X-Content-Type-Options'],
  // Ensure preflight requests are handled correctly
  preflightContinue: false
});

// Secondary middleware to ensure headers are always set (runs after corsMiddleware)
const ensureCorsHeaders = (req, res, next) => {
  const origin = req.headers.origin;
  
  // Check if origin is allowed
  if (isOriginAllowed(origin)) {
    // Always set CORS headers for allowed origins
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, X-Requested-With, Accept');
    res.header('Access-Control-Allow-Credentials', 'true');
    console.log('✅ CORS headers set for origin:', origin || 'no origin');
  } else if (origin) {
    console.log('⚠️ CORS: Origin not allowed, headers not set:', origin);
  }
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('🔄 Handling OPTIONS preflight request for:', req.url);
    return res.status(204).send();
  }
  
  next();
};

module.exports = {
  corsMiddleware,
  ensureCorsHeaders,
  handleOptions: (req, res) => {
    console.log('🔄 Explicit OPTIONS handler called for:', req.url);
    const origin = req.headers.origin;
    
    // Check if origin is allowed
    if (isOriginAllowed(origin)) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, X-Requested-With, Accept');
      res.header('Access-Control-Allow-Credentials', 'true');
      console.log('✅ OPTIONS: CORS headers set for origin:', origin || 'no origin');
    } else {
      console.log('❌ OPTIONS: Origin not allowed:', origin);
    }
    
    res.status(204).send();
  }
}; 