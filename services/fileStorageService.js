const fs = require('fs');
const path = require('path');
const multer = require('multer');
const drive = require('./googleDriveService');

// Use Google Drive if available
const USE_GOOGLE_DRIVE = process.env.USE_GOOGLE_DRIVE === 'true' && drive !== null;

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
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  }
});

// Exposed upload middleware to be used by controllers
const uploadMiddleware = multer({ storage: multerStorage });

function publicLocalUrl(category, filename) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
  return `${baseUrl}/uploads/${category}/${filename}`;
}

async function uploadEmployeeDoc(file, docType) {
  const category = 'employees';
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
  } catch (e) {
    console.error('Drive upload error:', e.message);
    throw new Error(`Failed to upload to Google Drive: ${e.message}`);
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