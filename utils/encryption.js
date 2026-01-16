const crypto = require('crypto');

/**
 * Encryption utility for sensitive employee payment data
 * Uses AES-256-GCM encryption with a key derived from environment variable
 */

// Get encryption key from environment (32 bytes for AES-256)
const getEncryptionKey = () => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required for payment data encryption');
  }
  // Ensure key is 32 bytes (256 bits) for AES-256
  return crypto.createHash('sha256').update(key).digest();
};

/**
 * Encrypt sensitive data (e.g., bank account number)
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted string in format: iv:authTag:encryptedData
 */
const encrypt = (text) => {
  if (!text) return null;
  
  try {
    const algorithm = 'aes-256-gcm';
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16); // 16 bytes for GCM
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return format: iv:authTag:encryptedData (all hex encoded)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypt sensitive data
 * @param {string} encryptedText - Encrypted string in format: iv:authTag:encryptedData
 * @returns {string} - Decrypted plain text
 */
const decrypt = (encryptedText) => {
  if (!encryptedText) return null;
  
  try {
    const algorithm = 'aes-256-gcm';
    const key = getEncryptionKey();
    
    // Split the encrypted string
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
};

module.exports = {
  encrypt,
  decrypt
};
