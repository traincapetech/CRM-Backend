const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Detect if running on Render.com
const isRender = process.env.RENDER === 'true';

// Base upload paths based on environment
const getBasePath = () => {
  if (isRender) {
    return '/tmp/crm-uploads'; // Use /tmp on Render
  }
  return process.env.NODE_ENV === 'production' 
    ? '/var/www/crm/uploads'
    : path.join(__dirname, '..', 'uploads');
};

// Get base path
const basePath = getBasePath();

// Define all required upload directories
const UPLOAD_PATHS = {
  DOCUMENTS: path.join(basePath, 'documents'),
  EMPLOYEES: path.join(basePath, 'employees'),
  INCENTIVES: path.join(basePath, 'incentives'),
  PROFILE_PICTURES: path.join(basePath, 'profile-pictures')
};

// Ensure all upload directories exist
Object.values(UPLOAD_PATHS).forEach(dir => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error(`Failed to create directory ${dir}:`, err.message);
    }
  }
});

// Local storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Choose appropriate directory based on upload type
    let uploadPath = UPLOAD_PATHS.DOCUMENTS; // default
    
    if (file.fieldname.includes('employee') || 
        ['photograph', 'tenthMarksheet', 'twelfthMarksheet', 'bachelorDegree', 
         'postgraduateDegree', 'aadharCard', 'panCard', 'pcc', 'resume', 'offerLetter']
         .includes(file.fieldname)) {
      uploadPath = UPLOAD_PATHS.EMPLOYEES;
    } else if (file.fieldname.includes('incentive')) {
      uploadPath = UPLOAD_PATHS.INCENTIVES;
    } else if (file.fieldname.includes('profile')) {
      uploadPath = UPLOAD_PATHS.PROFILE_PICTURES;
    }

    // Create directory if it doesn't exist
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${timestamp}-${random}${ext}`);
  }
});

// File filter for security
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: process.env.NODE_ENV === 'production' ? 5 * 1024 * 1024 : 10 * 1024 * 1024 // 5MB in prod, 10MB in dev
  }
});

module.exports = {
  upload,
  UPLOAD_PATHS,
  getBasePath
}; 