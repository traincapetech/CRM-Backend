/**
 * Helper utilities for Paytm payout operations
 * Migration Note: Migrated from Razorpay to Paytm
 */

/**
 * Format amount for display (paise to rupees)
 * @param {number} amountInPaise - Amount in paise
 * @returns {string} - Formatted amount string
 */
const formatAmount = (amountInPaise) => {
  if (!amountInPaise) return '₹0.00';
  const rupees = amountInPaise / 100;
  return `₹${rupees.toFixed(2)}`;
};

/**
 * Mask sensitive data for logging/display
 * @param {string} data - Data to mask
 * @param {number} visibleChars - Number of characters to show at start and end
 * @returns {string} - Masked data
 */
const maskSensitiveData = (data, visibleChars = 2) => {
  if (!data || data.length <= visibleChars * 2) {
    return '***';
  }
  const start = data.substring(0, visibleChars);
  const end = data.substring(data.length - visibleChars);
  const masked = '*'.repeat(data.length - (visibleChars * 2));
  return `${start}${masked}${end}`;
};

/**
 * Mask bank account number for display
 * @param {string} accountNumber - Bank account number
 * @returns {string} - Masked account number
 */
const maskBankAccount = (accountNumber) => {
  if (!accountNumber) return 'N/A';
  if (accountNumber.length <= 4) return '****';
  const last4 = accountNumber.substring(accountNumber.length - 4);
  return `****${last4}`;
};

/**
 * Mask UPI ID for display (shows only first part)
 * @param {string} upiId - UPI ID
 * @returns {string} - Masked UPI ID
 */
const maskUPI = (upiId) => {
  if (!upiId) return 'N/A';
  const parts = upiId.split('@');
  if (parts.length !== 2) return '***@***';
  const username = parts[0];
  const provider = parts[1];
  const maskedUsername = username.length > 2 
    ? `${username.substring(0, 2)}***` 
    : '***';
  return `${maskedUsername}@${provider}`;
};

/**
 * Get payout status color for UI
 * @param {string} status - Payout status
 * @returns {string} - Color class/hex
 */
const getPayoutStatusColor = (status) => {
  const statusColors = {
    'PENDING': '#FFA500',      // Orange
    'PROCESSING': '#2196F3',   // Blue
    'PROCESSED': '#4CAF50',     // Green
    'FAILED': '#F44336',        // Red
    'CANCELLED': '#9E9E9E',     // Gray
    'REVERSED': '#FF9800'       // Orange
  };
  return statusColors[status?.toUpperCase()] || '#9E9E9E';
};

/**
 * Get payout status label for display
 * @param {string} status - Payout status
 * @returns {string} - Human-readable status
 */
const getPayoutStatusLabel = (status) => {
  const statusLabels = {
    'PENDING': 'Pending',
    'PROCESSING': 'Processing',
    'PROCESSED': 'Processed',
    'FAILED': 'Failed',
    'CANCELLED': 'Cancelled',
    'REVERSED': 'Reversed'
  };
  return statusLabels[status?.toUpperCase()] || 'Unknown';
};

/**
 * Validate IFSC code format
 * @param {string} ifsc - IFSC code
 * @returns {boolean} - True if valid
 */
const validateIFSC = (ifsc) => {
  if (!ifsc) return false;
  const ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  return ifscPattern.test(ifsc.toUpperCase());
};

/**
 * Validate UPI ID format
 * @param {string} upiId - UPI ID
 * @returns {boolean} - True if valid
 */
const validateUPI = (upiId) => {
  if (!upiId) return false;
  const upiPattern = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
  return upiPattern.test(upiId.toLowerCase());
};

/**
 * Validate bank account number (basic validation)
 * @param {string} accountNumber - Bank account number
 * @returns {boolean} - True if valid
 */
const validateBankAccount = (accountNumber) => {
  if (!accountNumber) return false;
  // Bank account numbers are typically 9-18 digits
  const accountPattern = /^[0-9]{9,18}$/;
  return accountPattern.test(accountNumber);
};

/**
 * Get payment mode display name
 * @param {string} paymentMode - Payment mode ('bank' or 'upi')
 * @returns {string} - Display name
 */
const getPaymentModeLabel = (paymentMode) => {
  const labels = {
    'bank': 'Bank Transfer',
    'upi': 'UPI'
  };
  return labels[paymentMode] || 'Unknown';
};

module.exports = {
  formatAmount,
  maskSensitiveData,
  maskBankAccount,
  maskUPI,
  getPayoutStatusColor,
  getPayoutStatusLabel,
  validateIFSC,
  validateUPI,
  validateBankAccount,
  getPaymentModeLabel
};
