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

// Storage configuration based on environment
const storageConfig = {
  development: {
    type: 'local',
    destination: path.join(getBasePath(), 'documents'),
    publicPath: '/uploads/documents'
  },
  production: {
    type: process.env.STORAGE_TYPE || 'local',
    destination: process.env.UPLOAD_PATH || path.join(getBasePath(), 'documents'),
    publicPath: process.env.PUBLIC_PATH || '/uploads/documents',
    // Cloud storage configs
    aws: {
      bucket: process.env.AWS_S3_BUCKET,
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    gcs: {
      bucket: process.env.GCS_BUCKET,
      projectId: process.env.GCS_PROJECT_ID,
      keyFilename: process.env.GCS_KEY_FILE
    }
  }
};

const currentConfig = storageConfig[process.env.NODE_ENV || 'development'];

// Define all required upload directories
const uploadDirs = [
  path.join(getBasePath(), 'documents'),
  path.join(getBasePath(), 'employees'),
  path.join(getBasePath(), 'incentives'),
  path.join(getBasePath(), 'profile-pictures')
];

// Ensure upload directories exist
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    } catch (err) {
      console.error(`Failed to create directory ${dir}:`, err.message);
      // Don't throw - let the application continue
    }
  }
});

// Export paths for other modules to use
const UPLOAD_PATHS = {
  DOCUMENTS: path.join(getBasePath(), 'documents'),
  EMPLOYEES: path.join(getBasePath(), 'employees'),
  INCENTIVES: path.join(getBasePath(), 'incentives'),
  PROFILE_PICTURES: path.join(getBasePath(), 'profile-pictures')
};

// Local storage configuration
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Choose appropriate directory based on upload type
    let uploadPath = UPLOAD_PATHS.DOCUMENTS; // default
    if (file.fieldname.includes('employee')) {
      uploadPath = UPLOAD_PATHS.EMPLOYEES;
    } else if (file.fieldname.includes('incentive')) {
      uploadPath = UPLOAD_PATHS.INCENTIVES;
    } else if (file.fieldname.includes('profile')) {
      uploadPath = UPLOAD_PATHS.PROFILE_PICTURES;
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const fieldname = file.fieldname;
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `${fieldname}-${timestamp}-${random}${extension}`);
  }
});

// AWS S3 storage configuration
let s3Storage = null;
if (currentConfig.type === 's3') {
  const AWS = require('aws-sdk');
  const multerS3 = require('multer-s3');
  
  const s3 = new AWS.S3({
    accessKeyId: currentConfig.aws.accessKeyId,
    secretAccessKey: currentConfig.aws.secretAccessKey,
    region: currentConfig.aws.region
  });

  s3Storage = multerS3({
    s3: s3,
    bucket: currentConfig.aws.bucket,
    acl: 'private', // Important for security
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const fieldname = file.fieldname;
      const timestamp = Date.now();
      const random = Math.round(Math.random() * 1E9);
      const extension = path.extname(file.originalname);
      cb(null, `documents/${fieldname}-${timestamp}-${random}${extension}`);
    }
  });
}

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
  
  // Skip size validation in development
  if (process.env.NODE_ENV !== 'production') {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`), false);
    }
    return;
  }
  
  // Production size validation
  if (parseInt(req.headers['content-length']) < 10 * 1024) {
    cb(new Error('File size too small. Minimum size is 10KB'), false);
    return;
  }
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`), false);
  }
};

// Export configured storage
const storage = currentConfig.type === 's3' ? s3Storage : localStorage;

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: process.env.NODE_ENV === 'production' ? 20 * 1024 : 5 * 1024 * 1024, // 20KB in prod, 5MB in dev
    files: 10 // Maximum 10 files per request
  }
});

// Helper function to get file URL
const getFileUrl = (filepath) => {
  if (currentConfig.type === 's3') {
    return `https://${currentConfig.aws.bucket}.s3.${currentConfig.aws.region}.amazonaws.com/${filepath}`;
  } else {
    return `${process.env.BASE_URL || 'http://localhost:8080'}${currentConfig.publicPath}/${path.basename(filepath)}`;
  }
};

// Helper function to delete file
const deleteFile = async (filepath) => {
  if (currentConfig.type === 's3') {
    const AWS = require('aws-sdk');
    const s3 = new AWS.S3({
      accessKeyId: currentConfig.aws.accessKeyId,
      secretAccessKey: currentConfig.aws.secretAccessKey,
      region: currentConfig.aws.region
    });
    
    const params = {
      Bucket: currentConfig.aws.bucket,
      Key: filepath.replace(`https://${currentConfig.aws.bucket}.s3.${currentConfig.aws.region}.amazonaws.com/`, '')
    };
    
    return s3.deleteObject(params).promise();
  } else {
    // Local file deletion
    const fullPath = path.join(currentConfig.destination, path.basename(filepath));
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
};

module.exports = {
  upload,
  storage,
  currentConfig,
  getFileUrl,
  deleteFile,
  storageType: currentConfig.type,
  UPLOAD_PATHS
}; 