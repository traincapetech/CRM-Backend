/**
 * Paytm Payout Service
 * Handles Paytm Beneficiary creation and Payout processing
 * 
 * Migration Note: This service replaces the previous Razorpay service.
 * Uses Paytm Payouts API v1/v1.2 with correct endpoints and authentication.
 */

const axios = require('axios');
const PaytmChecksum = require('paytmchecksum');

// Paytm Base URL - determined by environment
// Production: https://dashboard.paytm.com
// Staging: https://staging-dashboard.paytm.com
const PAYTM_BASE_URL =
  process.env.PAYTM_ENV === 'production'
    ? 'https://dashboard.paytm.com'
    : 'https://staging-dashboard.paytm.com';

/**
 * Generate Paytm checksum using paytmchecksum package
 * Checksum is generated from JSON stringified body WITHOUT the checksum field
 * @param {Object} body - Request body (without checksum field)
 * @param {string} merchantKey - Paytm merchant key
 * @returns {Promise<string>} - Checksum hash
 */
const generateChecksum = async (body, merchantKey) => {
  try {
    // Remove checksum if present (shouldn't be, but safety check)
    const { checksum: _, ...bodyWithoutChecksum } = body;
    
    // Generate checksum from JSON stringified body
    const jsonString = JSON.stringify(bodyWithoutChecksum);
    const checksum = await PaytmChecksum.generateSignature(jsonString, merchantKey);
    
    return checksum;
  } catch (error) {
    console.error('Error generating Paytm checksum:', error.message);
    throw new Error(`Failed to generate Paytm checksum: ${error.message}`);
  }
};

/**
 * Mask sensitive data for logging
 * @param {string} accountNumber - Bank account number
 * @returns {string} - Masked account number (shows only last 4 digits)
 */
const maskAccountNumber = (accountNumber) => {
  if (!accountNumber || accountNumber.length < 4) {
    return '****';
  }
  return '****' + accountNumber.slice(-4);
};

/**
 * Create Paytm Beneficiary
 * Endpoint: POST /payout/v1/beneficiary
 * 
 * @param {Object} beneficiaryData - Beneficiary information
 * @param {string} beneficiaryData.name - Beneficiary name
 * @param {string} beneficiaryData.email - Beneficiary email (optional)
 * @param {string} beneficiaryData.mobile - Beneficiary mobile number (optional)
 * @param {string} beneficiaryData.paymentMode - 'bank' or 'upi'
 * @param {Object} beneficiaryData.bankDetails - Bank details (if paymentMode is 'bank')
 * @param {string} beneficiaryData.bankDetails.accountNumber - Bank account number
 * @param {string} beneficiaryData.bankDetails.ifsc - IFSC code
 * @param {string} beneficiaryData.bankDetails.accountHolderName - Account holder name
 * @param {string} beneficiaryData.upiId - UPI ID (if paymentMode is 'upi')
 * @returns {Promise<Object>} - Paytm beneficiary object with beneficiaryId
 */
const createBeneficiary = async (beneficiaryData) => {
  try {
    const merchantId = process.env.PAYTM_MERCHANT_ID;
    const merchantKey = process.env.PAYTM_MERCHANT_KEY;
    
    if (!merchantId || !merchantKey) {
      throw new Error('PAYTM_MERCHANT_ID and PAYTM_MERCHANT_KEY environment variables are required');
    }
    
    const { name, email, mobile, paymentMode, bankDetails, upiId } = beneficiaryData;
    
    // Validate required fields
    if (!name || !paymentMode) {
      throw new Error('Name and payment mode are required for creating Paytm beneficiary');
    }
    
    // Generate unique beneficiary ID
    const beneficiaryId = `EMP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Build request body - Paytm Payouts API v1 format
    // Mandatory: mid, beneficiaryId, name
    const requestBody = {
      mid: merchantId,
      beneficiaryId: beneficiaryId,
      name: name
    };
    
    // Add conditional fields based on payment mode
    // Do NOT send bank and UPI fields together
    if (paymentMode === 'bank') {
      if (!bankDetails || !bankDetails.accountNumber || !bankDetails.ifsc) {
        throw new Error('Bank account number and IFSC code are required for bank transfers');
      }
      
      // Bank transfer fields: account, ifsc
      requestBody.account = bankDetails.accountNumber;
      requestBody.ifsc = bankDetails.ifsc.toUpperCase();
      
      console.log('Paytm Beneficiary Request (Bank):', {
        mid: merchantId,
        beneficiaryId: beneficiaryId,
        name: name,
        account: maskAccountNumber(bankDetails.accountNumber),
        ifsc: bankDetails.ifsc.toUpperCase()
      });
    } else if (paymentMode === 'upi') {
      if (!upiId) {
        throw new Error('UPI ID is required for UPI transfers');
      }
      
      // Validate UPI format
      const upiPattern = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
      if (!upiPattern.test(upiId.toLowerCase())) {
        throw new Error('Invalid UPI ID format. Expected format: user@paytm or user@phonepe');
      }
      
      // UPI transfer field: vpa
      requestBody.vpa = upiId.toLowerCase();
      
      console.log('Paytm Beneficiary Request (UPI):', {
        mid: merchantId,
        beneficiaryId: beneficiaryId,
        name: name,
        vpa: upiId.toLowerCase()
      });
    } else {
      throw new Error('Invalid payment mode. Must be "bank" or "upi"');
    }
    
    // Generate checksum from body WITHOUT checksum field
    const checksum = await generateChecksum(requestBody, merchantKey);
    
    // Add checksum to request body
    requestBody.checksum = checksum;
    
    // Paytm Payouts API endpoint: POST /payout/v1/beneficiary
    const url = `${PAYTM_BASE_URL}/payout/v1/beneficiary`;
    
    console.log('Paytm API Request:', {
      url: url,
      method: 'POST',
      mid: merchantId,
      beneficiaryId: beneficiaryId,
      paymentMode: paymentMode
    });
    
    // Make API call - ONLY Content-Type header required
    const response = await axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Paytm API Response:', {
      status: response.status,
      data: response.data
    });
    
    // Check for success response
    if (response.data && (response.data.status === 'SUCCESS' || response.data.success === true)) {
      return {
        beneficiaryId: beneficiaryId,
        status: response.data.status || 'SUCCESS',
        message: response.data.message || 'Beneficiary created successfully'
      };
    } else {
      const errorMsg = response.data?.message || response.data?.error || response.data?.statusMessage || 'Failed to create Paytm beneficiary';
      console.error('Paytm API Error Response:', response.data);
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error('Error creating Paytm beneficiary:', error.message);
    
    // Log Paytm API response if available
    if (error.response) {
      console.error('Paytm API Error Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    
    // Handle network/DNS errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      throw new Error(`Network error: Cannot reach Paytm API at ${PAYTM_BASE_URL}`);
    }
    
    // Handle API errors
    if (error.response) {
      const errorDetails = error.response.data || {};
      const statusCode = error.response.status;
      
      // Return detailed error message
      const errorMsg = errorDetails.message || 
                      errorDetails.error || 
                      errorDetails.statusMessage ||
                      `Paytm API error (${statusCode})`;
      
      throw new Error(`Failed to create Paytm beneficiary: ${errorMsg}`);
    }
    
    throw new Error(`Failed to create Paytm beneficiary: ${error.message}`);
  }
};

/**
 * Create Paytm Payout
 * Endpoint: POST /payout/v1.2/transfer
 * 
 * @param {Object} payoutData - Payout details
 * @param {string} payoutData.beneficiaryId - Paytm beneficiary ID
 * @param {number} payoutData.amount - Amount in rupees
 * @param {string} payoutData.currency - Currency code (default: INR)
 * @param {string} payoutData.transferMode - Transfer mode: 'IMPS', 'NEFT', 'UPI' (default: 'IMPS')
 * @param {string} payoutData.purpose - Payout purpose (default: 'salary')
 * @param {string} payoutData.referenceId - Unique reference ID for the payout
 * @param {string} payoutData.remarks - Remarks for the payout
 * @returns {Promise<Object>} - Paytm payout response with transaction ID
 */
const createPayout = async (payoutData) => {
  try {
    const merchantId = process.env.PAYTM_MERCHANT_ID;
    const merchantKey = process.env.PAYTM_MERCHANT_KEY;
    
    if (!merchantId || !merchantKey) {
      throw new Error('PAYTM_MERCHANT_ID and PAYTM_MERCHANT_KEY environment variables are required');
    }
    
    const {
      beneficiaryId,
      amount,
      currency = 'INR',
      transferMode = 'IMPS',
      purpose = 'salary',
      referenceId,
      remarks
    } = payoutData;
    
    // Validate required fields
    if (!beneficiaryId || !amount) {
      throw new Error('Beneficiary ID and amount are required for payout');
    }
    
    // Amount should be in rupees (Paytm accepts rupees, not paise)
    const amountInRupees = typeof amount === 'number' && amount > 1000 
      ? amount / 100  // If in paise, convert to rupees
      : amount;
    
    // Build payout request - Paytm Payouts API v1.2 format
    const requestBody = {
      mid: merchantId,
      beneficiaryId: beneficiaryId,
      amount: amountInRupees.toString(),
      currency: currency,
      transferMode: transferMode,
      purpose: purpose,
      transferId: referenceId || `payout_${Date.now()}`,
      remarks: remarks || `Salary payout - ${new Date().toISOString()}`
    };
    
    // Generate checksum from body WITHOUT checksum field
    const checksum = await generateChecksum(requestBody, merchantKey);
    
    // Add checksum to request body
    requestBody.checksum = checksum;
    
    // Paytm Payouts API endpoint: POST /payout/v1.2/transfer
    const url = `${PAYTM_BASE_URL}/payout/v1.2/transfer`;
    
    console.log('Paytm Payout Request:', {
      url: url,
      method: 'POST',
      mid: merchantId,
      beneficiaryId: beneficiaryId,
      amount: amountInRupees,
      transferMode: transferMode
    });
    
    // Make API call - ONLY Content-Type header required
    const response = await axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Paytm Payout Response:', {
      status: response.status,
      data: response.data
    });
    
    if (response.data && response.data.status === 'SUCCESS') {
      return {
        transactionId: response.data.transferId || requestBody.transferId,
        status: response.data.status,
        amount: amountInRupees,
        currency: currency,
        transferMode: transferMode,
        message: response.data.message || 'Payout initiated successfully',
        timestamp: new Date().toISOString()
      };
    } else {
      const errorMsg = response.data?.message || response.data?.error || 'Failed to create Paytm payout';
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error('Error creating Paytm payout:', error.message);
    
    // Handle network/DNS errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      throw new Error(`Network error: Cannot reach Paytm API at ${PAYTM_BASE_URL}`);
    }
    
    if (error.response) {
      const errorDetails = error.response.data || {};
      const errorMsg = errorDetails.message || errorDetails.error || errorDetails.statusMessage || `Paytm API error (${error.response.status})`;
      throw new Error(`Failed to create Paytm payout: ${errorMsg}`);
    }
    
    throw new Error(`Failed to create Paytm payout: ${error.message}`);
  }
};

/**
 * Get Payout Status
 * Endpoint: POST /payout/v1.2/getTransferStatus
 * 
 * @param {string} transferId - Paytm transfer/transaction ID
 * @returns {Promise<Object>} - Payout status details
 */
const getPayoutStatus = async (transferId) => {
  try {
    const merchantId = process.env.PAYTM_MERCHANT_ID;
    const merchantKey = process.env.PAYTM_MERCHANT_KEY;
    
    if (!merchantId || !merchantKey) {
      throw new Error('PAYTM_MERCHANT_ID and PAYTM_MERCHANT_KEY environment variables are required');
    }
    
    if (!transferId) {
      throw new Error('Transfer ID is required');
    }
    
    // Build status request
    const requestBody = {
      mid: merchantId,
      transferId: transferId
    };
    
    // Generate checksum from body WITHOUT checksum field
    const checksum = await generateChecksum(requestBody, merchantKey);
    
    // Add checksum to request body
    requestBody.checksum = checksum;
    
    // Paytm Payouts API endpoint: POST /payout/v1.2/getTransferStatus
    const url = `${PAYTM_BASE_URL}/payout/v1.2/getTransferStatus`;
    
    console.log('Paytm Status Request:', {
      url: url,
      method: 'POST',
      mid: merchantId,
      transferId: transferId
    });
    
    // Make API call - ONLY Content-Type header required
    const response = await axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.status) {
      return {
        transferId: response.data.transferId || transferId,
        status: response.data.status, // SUCCESS, FAILED, PENDING, etc.
        amount: response.data.amount,
        transferMode: response.data.transferMode,
        message: response.data.message,
        timestamp: response.data.timestamp || new Date().toISOString()
      };
    } else {
      throw new Error(response.data?.message || 'Failed to fetch payout status');
    }
  } catch (error) {
    console.error('Error fetching Paytm payout status:', error.message);
    
    // Handle network/DNS errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      throw new Error(`Network error: Cannot reach Paytm API at ${PAYTM_BASE_URL}`);
    }
    
    if (error.response) {
      const errorDetails = error.response.data || {};
      const errorMsg = errorDetails.message || errorDetails.error || errorDetails.statusMessage || `Paytm API error (${error.response.status})`;
      throw new Error(`Failed to fetch payout status: ${errorMsg}`);
    }
    
    throw new Error(`Failed to fetch payout status: ${error.message}`);
  }
};

/**
 * Handle Paytm Payout Callback (webhook handler)
 * @param {Object} callbackData - Paytm callback data
 * @returns {Promise<Object>} - Processed callback data
 */
const handlePayoutCallback = async (callbackData) => {
  try {
    // Verify checksum if provided
    if (callbackData.checksum) {
      const merchantKey = process.env.PAYTM_MERCHANT_KEY;
      if (!merchantKey) {
        throw new Error('PAYTM_MERCHANT_KEY is required for callback verification');
      }
      
      const { checksum, ...dataWithoutChecksum } = callbackData;
      const calculatedChecksum = await generateChecksum(dataWithoutChecksum, merchantKey);
      
      if (calculatedChecksum !== checksum) {
        throw new Error('Invalid checksum in Paytm callback');
      }
    }
    
    return {
      transferId: callbackData.transferId,
      status: callbackData.status, // SUCCESS, FAILED, PENDING
      amount: callbackData.amount,
      transferMode: callbackData.transferMode,
      message: callbackData.message,
      timestamp: callbackData.timestamp || new Date().toISOString()
    };
  } catch (error) {
    console.error('Error handling Paytm payout callback:', error);
    throw error;
  }
};

module.exports = {
  createBeneficiary,
  createPayout,
  getPayoutStatus,
  handlePayoutCallback
};
