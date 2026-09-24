const crypto = require("crypto");

/**
 * Encryption utility for sensitive PII data
 * Uses AES-256-GCM encryption with a key derived from environment variable
 */

// Get encryption key from environment (32 bytes for AES-256)
const getEncryptionKey = () => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required for PII data encryption",
    );
  }
  // Ensure key is 32 bytes (256 bits) for AES-256
  return crypto.createHash("sha256").update(key).digest();
};

/**
 * Check if a value is already encrypted (format: iv:authTag:encryptedData)
 * @param {string} text - Text to check
 * @returns {boolean} - True if already encrypted
 */
const isEncrypted = (text) => {
  if (!text || typeof text !== "string") return false;
  const parts = text.split(":");
  // Encrypted format: iv(32 hex chars):authTag(32 hex chars):data(variable)
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
};

/**
 * Encrypt sensitive data (e.g., phone, address, Aadhar)
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted string in format: iv:authTag:encryptedData
 */
const encrypt = (text) => {
  if (!text) return null;

  // Don't double-encrypt
  if (isEncrypted(text)) return text;

  try {
    const algorithm = "aes-256-gcm";
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16); // 16 bytes for GCM

    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Return format: iv:authTag:encryptedData (all hex encoded)
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt data");
  }
};

/**
 * Decrypt sensitive data
 * @param {string} encryptedText - Encrypted string in format: iv:authTag:encryptedData
 * @returns {string} - Decrypted plain text
 */
const decrypt = (encryptedText) => {
  if (!encryptedText) return null;

  // If not encrypted, return as-is (for backward compatibility)
  if (!isEncrypted(encryptedText)) return encryptedText;

  try {
    const algorithm = "aes-256-gcm";
    const key = getEncryptionKey();

    // Split the encrypted string
    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt data");
  }
};

/**
 * Create a deterministic hash for searchable encrypted fields (blind indexing)
 * @param {string} text - Plain text to hash
 * @returns {string} - SHA-256 hash (hex encoded)
 */
const hashForSearch = (text) => {
  if (!text) return null;
  const key = process.env.ENCRYPTION_KEY || "default-salt";
  // Use HMAC-SHA256 with the encryption key as salt for consistency
  return crypto
    .createHmac("sha256", key)
    .update(text.toLowerCase().trim())
    .digest("hex");
};

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  hashForSearch,
};
