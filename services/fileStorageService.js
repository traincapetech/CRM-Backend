const fs = require('fs');
const path = require('path');
const multer = require('multer');
const drive = require('./googleDriveService');

// Use Google Drive if available
const USE_GOOGLE_DRIVE = process.env.USE_GOOGLE_DRIVE === 'true' && drive !== null;

console.log('File Storage Service Configuration:', {
  USE_GOOGLE_DRIVE_ENV: process.env.USE_GOOGLE_DRIVE,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
  driveModule: drive ? 'Available' : 'Not available',
  USE_GOOGLE_DRIVE: USE_GOOGLE_DRIVE,
  keyFileExists: fs.existsSync('./config/google-credentials.json')
});

// Define upload paths
const UPLOAD_PATHS = {
  EMPLOYEES: path.join(__dirname, '..', 'uploads', 'employees'),
  DOCUMENTS: path.join(__dirname, '..', 'uploads', 'documents'),
  PROFILE_PICTURES: path.join(__dirname, '..', 'uploads', 'profile-pictures'),
  INCENTIVES: path.join(__dirname, '..', 'uploads', 'incentives'),
  TMP: path.join(__dirname, '..', 'uploads', 'tmp')
};

// Ensure all upload directories exist
Object.values(UPLOAD_PATHS).forEach(dir => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    console.log('Created directory:', dir);
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error('Error creating directory:', dir, err);
    }
  }
});

// Ensure a temp upload directory exists for incoming multipart files
function ensureTmpDir() {
  const tmpDir = path.join(__dirname, '..', 'uploads', 'tmp');
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
  } catch {}
  return tmpDir;
}

// Multer storage to save incoming files to a temp folder before we move/upload them
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = ensureTmpDir();
    console.log(`Multer: Saving file ${file.fieldname} to temp dir: ${dir}`);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    console.log(`Multer: Generated filename for ${file.fieldname}: ${name}`);
    cb(null, name);
  }
});

// Exposed upload middleware to be used by controllers
const uploadMiddleware = multer({ 
  storage: multerStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Allow up to 10 files
  }
});

function publicLocalUrl(category, filename) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
  return `${baseUrl}/uploads/${category}/${filename}`;
}

async function uploadEmployeeDoc(file, docType) {
  const category = 'employees';
  console.log(`Uploading employee document: ${docType}, USE_GOOGLE_DRIVE: ${USE_GOOGLE_DRIVE}`);
  
  try {
    if (USE_GOOGLE_DRIVE) {
      console.log('Attempting Google Drive upload...');
      try {
        const result = await drive.upload(file.path, file.filename, file.mimetype, 'employee', docType);
        try { fs.unlinkSync(file.path); } catch {}
        return {
          storage: 'google-drive',
          fileName: file.filename,
          url: result.url,
          fileId: result.fileId,
          webViewLink: result.webViewLink,
          webContentLink: result.webContentLink,
          uploadedAt: new Date(),
          mimetype: file.mimetype,
          size: file.size,
          originalName: file.originalname
        };
      } catch (driveError) {
        console.error('Google Drive upload failed:', driveError.message);
        throw new Error(`Google Drive upload failed: ${driveError.message}`);
      }
    }
    
    // If we reach here, Google Drive is not enabled
    throw new Error('Google Drive is not enabled. Please configure Google Drive properly.');
  } catch (e) {
    console.error('Upload error:', e.message);
    throw new Error(`Failed to upload file: ${e.message}`);
  }
}

async function deleteEmployeeDoc(info) {
  try {
    if (info?.storage === 'google-drive' && info.fileId) {
      await drive.delete(info.fileId);
      return true;
    }
    throw new Error('Invalid document info or missing Google Drive fileId');
  } catch (e) {
    console.error('Delete doc error:', e.message);
    throw e;
  }
}

module.exports = { 
  uploadMiddleware, 
  uploadEmployeeDoc, 
  deleteEmployeeDoc,
  UPLOAD_PATHS
}; 