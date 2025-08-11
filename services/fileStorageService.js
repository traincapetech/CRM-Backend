const fs = require('fs');
const path = require('path');
const multer = require('multer');
const drive = require('./googleDriveService');

const USE_GOOGLE_DRIVE = process.env.USE_GOOGLE_DRIVE === 'true';

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
  if (USE_GOOGLE_DRIVE) {
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
    }
  }
  const permanentDir = path.join(__dirname, '..', 'uploads', category);
  fs.mkdirSync(permanentDir, { recursive: true });
  const destPath = path.join(permanentDir, file.filename);
  fs.renameSync(file.path, destPath);
  return {
    storage: 'local',
    fileName: file.filename,
    path: destPath,
    url: publicLocalUrl(category, file.filename),
    uploadedAt: new Date(),
    mimetype: file.mimetype,
    size: file.size,
    originalName: file.originalname
  };
}

async function deleteEmployeeDoc(info) {
  try {
    if (info?.storage === 'google-drive' && info.fileId) {
      await drive.delete(info.fileId);
      return true;
    }
    if (info?.storage === 'local' && info.path && fs.existsSync(info.path)) {
      fs.unlinkSync(info.path);
      return true;
    }
  } catch (e) {
    console.error('Delete doc error:', e.message);
  }
  return false;
}

module.exports = { uploadMiddleware, uploadEmployeeDoc, deleteEmployeeDoc }; 