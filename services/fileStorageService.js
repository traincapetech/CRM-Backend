const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

// Import R2 service
const {
  uploadToR2,
  deleteFromR2,
  isR2Configured,
  getKeyFromUrl,
} = require("./r2Service");

console.log("File Storage Service Configuration:", {
  R2_CONFIGURED: isR2Configured,
  STORAGE_MODE: isR2Configured ? "Cloudflare R2" : "Local Storage",
});

// Define upload paths for local fallback
const UPLOAD_PATHS = {
  EMPLOYEES: path.join(__dirname, "..", "uploads", "employees"),
  DOCUMENTS: path.join(__dirname, "..", "uploads", "documents"),
  PROFILE_PICTURES: path.join(__dirname, "..", "uploads", "profile-pictures"),
  INCENTIVES: path.join(__dirname, "..", "uploads", "incentives"),
  TMP: path.join(__dirname, "..", "uploads", "tmp"),
};

// Ensure all upload directories exist (for temp files and fallback)
Object.values(UPLOAD_PATHS).forEach((dir) => {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") {
      console.error("Error creating directory:", dir, err);
    }
  }
});

// Allowed file extensions and MIME types whitelist
const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".rtf",
  ".zip",
  ".rar",
]);

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "application/rtf",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/octet-stream",
]);

const fileFilter = (req, file, cb) => {
  if (!file || !file.originalname) {
    return cb(new Error("File missing or invalid"), false);
  }

  // Prevent null byte attacks or path traversal in originalname
  if (file.originalname.includes("\0") || file.originalname.includes("..")) {
    return cb(new Error("Invalid file name"), false);
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(
      new Error(
        `File extension '${ext}' is not permitted. Allowed extensions: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`
      ),
      false
    );
  }

  // Reject executable or script-like secondary extensions (e.g., test.php.png, exploit.exe.jpg)
  const parts = file.originalname.toLowerCase().split(".");
  const dangerousTokens = [
    "php", "phtml", "jsp", "asp", "aspx", "exe", "sh", "bash", "bat", "cmd",
    "js", "mjs", "cjs", "html", "htm", "svg", "vbs", "ps1", "jar", "war"
  ];
  if (parts.slice(1, -1).some((p) => dangerousTokens.includes(p))) {
    return cb(new Error("Disallowed file name structure"), false);
  }

  if (ALLOWED_MIMES.has(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File MIME type '${file.mimetype}' is not permitted.`
      ),
      false
    );
  }
};

// Multer storage to save incoming files to a temp folder before we upload to R2
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tmpDir = UPLOAD_PATHS.TMP;
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
    } catch {}
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeField = (file.fieldname || "file").replace(/[^a-zA-Z0-9_-]/g, "");
    const randomHex = crypto.randomBytes(8).toString("hex");
    const name = `${safeField}-${Date.now()}-${randomHex}${ext}`;
    cb(null, name);
  },
});

// Exposed upload middleware to be used by controllers
const uploadMiddleware = multer({
  storage: multerStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 20, // Allow up to 20 files for split document uploads
  },
});

/**
 * Upload an employee document to R2 or local storage
 * @param {Object} file - Multer file object
 * @param {string} docType - Document type (e.g., 'aadharCard', 'resume')
 * @returns {Promise<Object>} Upload result with URL
 */
async function uploadEmployeeDoc(file, docType) {
  console.log(
    `Uploading employee document: ${docType}, R2 configured: ${isR2Configured}`,
  );

  try {
    if (isR2Configured) {
      // Upload to Cloudflare R2
      console.log("Uploading to Cloudflare R2...");
      const result = await uploadToR2(file, "employees");

      return {
        storage: "cloudflare-r2",
        fileName: file.filename,
        url: result.url,
        key: result.key,
        uploadedAt: new Date(),
        mimetype: file.mimetype,
        size: file.size,
        originalName: file.originalname,
        docType: docType,
      };
    } else {
      // Fallback to local storage
      console.log("Using local storage fallback...");
      const destDir = UPLOAD_PATHS.EMPLOYEES;
      const destPath = path.join(destDir, file.filename);

      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(file.path, destPath);

      try {
        fs.unlinkSync(file.path);
      } catch {}

      const localUrl = `/uploads/employees/${file.filename}`;

      return {
        storage: "local",
        fileName: file.filename,
        url: localUrl,
        uploadedAt: new Date(),
        mimetype: file.mimetype,
        size: file.size,
        originalName: file.originalname,
        docType: docType,
      };
    }
  } catch (error) {
    console.error("Upload error:", error.message);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

/**
 * Upload a generic file to R2 or local storage
 * @param {Object} file - Multer file object
 * @param {string} folder - Folder name (e.g., 'expenses', 'chat')
 * @returns {Promise<Object>} Upload result with URL
 */
async function uploadFile(file, folder = "uploads") {
  console.log(`Uploading file: ${folder}, R2 configured: ${isR2Configured}`);

  try {
    if (isR2Configured) {
      // Upload to Cloudflare R2
      const result = await uploadToR2(file, folder);

      return {
        storage: "cloudflare-r2",
        fileName: file.filename,
        url: result.url,
        key: result.key,
        uploadedAt: new Date(),
        mimetype: file.mimetype,
        size: file.size,
        originalName: file.originalname,
      };
    } else {
      // Fallback to local storage
      // Determine destination directory based on folder
      let destDir = UPLOAD_PATHS.TMP; // Default
      if (folder === "employees") destDir = UPLOAD_PATHS.EMPLOYEES;
      else if (folder === "documents") destDir = UPLOAD_PATHS.DOCUMENTS;
      else if (folder === "incentives") destDir = UPLOAD_PATHS.INCENTIVES;
      else {
        // Create generic folder if not mapped
        destDir = path.join(__dirname, "..", "uploads", folder);
      }

      const destPath = path.join(destDir, file.filename);

      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(file.path, destPath);

      try {
        fs.unlinkSync(file.path);
      } catch {}

      const localUrl = `/uploads/${folder}/${file.filename}`;

      return {
        storage: "local",
        fileName: file.filename,
        url: localUrl,
        uploadedAt: new Date(),
        mimetype: file.mimetype,
        size: file.size,
        originalName: file.originalname,
      };
    }
  } catch (error) {
    console.error("Upload error:", error.message);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

/**
 * Delete an employee document from R2 or local storage
 * @param {Object} info - Document info object with storage type and url/key
 * @returns {Promise<boolean>} Success status
 */
async function deleteEmployeeDoc(info) {
  try {
    if (info?.storage === "cloudflare-r2" && info.key) {
      await deleteFromR2(info.key);
      return true;
    } else if (info?.storage === "cloudflare-r2" && info.url) {
      const key = getKeyFromUrl(info.url);
      if (key) {
        await deleteFromR2(key);
        return true;
      }
    } else if (info?.storage === "local" && info.fileName) {
      const filePath = path.join(UPLOAD_PATHS.EMPLOYEES, info.fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
    }
    console.warn("Could not determine how to delete document:", info);
    return false;
  } catch (error) {
    console.error("Delete doc error:", error.message);
    throw error;
  }
}

module.exports = {
  uploadMiddleware,
  uploadEmployeeDoc,
  uploadFile,
  deleteEmployeeDoc,
  deleteEmployeeDoc,
  UPLOAD_PATHS,
  isR2Configured,
};
