const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

// R2 Configuration using environment variables
const R2_ACCOUNT_ID = process.env.Account_ID;
const R2_ACCESS_KEY_ID = process.env.Access_Key_Id;
const R2_SECRET_ACCESS_KEY = process.env.Secret_Access_Key;
const R2_BUCKET_NAME = process.env.Bucket_Name;
const R2_PUBLIC_URL = process.env.Public_URL;

// Check if R2 is configured
const isR2Configured =
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME;

// Create S3 client configured for Cloudflare R2
let s3Client = null;

if (isR2Configured) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  console.log("✅ Cloudflare R2 storage configured successfully");
} else {
  console.warn(
    "⚠️ Cloudflare R2 not configured. Missing environment variables.",
  );
}

/**
 * Upload a file to Cloudflare R2
 * @param {Object} file - Multer file object with path, filename, mimetype
 * @param {string} folder - Folder/prefix in R2 bucket (e.g., 'profile-pictures', 'employees')
 * @returns {Promise<Object>} Upload result with URL and key
 */
async function uploadToR2(file, folder = "uploads") {
  if (!isR2Configured || !s3Client) {
    throw new Error("Cloudflare R2 is not configured");
  }

  try {
    // Read file from disk
    const fileContent = fs.readFileSync(file.path);

    // Generate unique key
    const fileKey = `${folder}/${file.filename}`;

    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileKey,
      Body: fileContent,
      ContentType: file.mimetype,
    });

    await s3Client.send(command);

    // Clean up temp file
    try {
      fs.unlinkSync(file.path);
    } catch (unlinkErr) {
      console.warn("Could not remove temp file:", unlinkErr.message);
    }

    // Generate public URL
    const publicUrl = `${R2_PUBLIC_URL}/${fileKey}`;

    console.log(`✅ File uploaded to R2: ${publicUrl}`);

    return {
      success: true,
      url: publicUrl,
      key: fileKey,
      bucket: R2_BUCKET_NAME,
      storage: "cloudflare-r2",
    };
  } catch (error) {
    console.error("❌ R2 upload error:", error.message);
    throw error;
  }
}

/**
 * Delete a file from Cloudflare R2
 * @param {string} fileKey - The key/path of the file in R2
 * @returns {Promise<boolean>} Success status
 */
async function deleteFromR2(fileKey) {
  if (!isR2Configured || !s3Client) {
    throw new Error("Cloudflare R2 is not configured");
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileKey,
    });

    await s3Client.send(command);
    console.log(`✅ File deleted from R2: ${fileKey}`);
    return true;
  } catch (error) {
    console.error("❌ R2 delete error:", error.message);
    throw error;
  }
}

/**
 * Extract the file key from a full R2 URL
 * @param {string} url - Full R2 public URL
 * @returns {string|null} The file key or null if not an R2 URL
 */
function getKeyFromUrl(url) {
  if (!url || !R2_PUBLIC_URL) return null;

  if (url.startsWith(R2_PUBLIC_URL)) {
    return url.replace(`${R2_PUBLIC_URL}/`, "");
  }
  return null;
}

module.exports = {
  uploadToR2,
  deleteFromR2,
  getKeyFromUrl,
  isR2Configured,
  R2_PUBLIC_URL,
};
