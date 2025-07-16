const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Storage configuration based on environment
const storageConfig = {
  development: {
    type: 'local',
    destination: './uploads/documents',
    publicPath: '/uploads/documents'
  },
  production: {
    type: process.env.STORAGE_TYPE || 'local', // 's3', 'gcs', 'azure', 'local'
    destination: process.env.UPLOAD_PATH || '/var/www/crm/uploads/documents',
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

// Ensure upload directory exists for local storage
if (currentConfig.type === 'local') {
  if (!fs.existsSync(currentConfig.destination)) {
    fs.mkdirSync(currentConfig.destination, { recursive: true });
  }
}

// Ensure upload directories exist
const ensureUploadDirectories = () => {
  const directories = [
    currentConfig.destination,
    './uploads/documents',
    './uploads/profile-pictures',
    './uploads/employees'
  ];

  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
};

// Call it on module load
ensureUploadDirectories();

// Local storage configuration
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, currentConfig.destination);
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
  storageType: currentConfig.type
}; 