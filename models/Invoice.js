const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema({
  // Invoice Details
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  invoiceDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  dueDate: {
    type: Date,
    required: false
  },
  paymentTerms: {
    type: String,
    enum: ['Due on Receipt', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Custom'],
    default: 'Due on Receipt'
  },
  customPaymentTerms: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled', 'Partially Paid'],
    default: 'Draft'
  },
  
  // Company Information
  companyInfo: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    logo: {
      type: String, // URL to logo file
      trim: true
    },
    address: {
      street: {
        type: String,
        required: true,
        trim: true
      },
      city: {
        type: String,
        required: true,
        trim: true
      },
      state: {
        type: String,
        required: true,
        trim: true
      },
      zipCode: {
        type: String,
        required: true,
        trim: true
      },
      country: {
        type: String,
        required: true,
        trim: true
      }
    },
    gstin: {
      type: String,
      trim: true
    },
    pan: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    website: {
      type: String,
      trim: true
    }
  },
  
  // Client Information
  clientInfo: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    company: {
      type: String,
      trim: true
    },
    address: {
      street: {
        type: String,
        required: true,
        trim: true
      },
      city: {
        type: String,
        required: true,
        trim: true
      },
      state: {
        type: String,
        required: true,
        trim: true
      },
      zipCode: {
        type: String,
        required: true,
        trim: true
      },
      country: {
        type: String,
        required: true,
        trim: true
      }
    },
    email: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    }
  },
  
  // Line Items
  items: [{
    description: {
      type: String,
      required: true,
      trim: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.01
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'percentage'
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    gst: {
      type: Number,
      default: 0,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  
  // Totals
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  totalDiscount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalTax: {
    type: Number,
    default: 0,
    min: 0
  },
  gstAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  amountPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  balanceDue: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Currency
  currency: {
    type: String,
    default: 'INR',
    enum: [
      // Major Global Currencies
      'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR',
      // North America
      'CAD', 'MXN',
      // Europe
      'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RUB', 'TRY', 'BGN', 'RON', 'HRK', 'RSD', 'UAH',
      // Asia Pacific
      'AUD', 'NZD', 'SGD', 'HKD', 'KRW', 'TWD', 'THB', 'MYR', 'IDR', 'PHP', 'VND', 'BDT', 'PKR', 'LKR', 'NPR', 'MMK', 'KHR', 'LAK', 'MNT',
      // Middle East & Africa
      'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'JOD', 'LBP', 'EGP', 'ZAR', 'NGN', 'KES', 'GHS', 'UGX', 'TZS', 'ETB', 'MAD', 'TND', 'DZD', 'LYD', 'SDG', 'SOS', 'DJF', 'KMF', 'MUR', 'SCR', 'MVR', 'CVE', 'STD', 'GMD', 'GNF', 'SLL', 'LRD', 'XOF', 'XAF', 'XPF',
      // South America
      'ARS', 'CLP', 'COP', 'PEN', 'UYU', 'PYG', 'BOB', 'VES', 'GYD', 'SRD', 'FKP',
      // Central America & Caribbean
      'GTQ', 'HNL', 'NIO', 'CRC', 'PAB', 'BZD', 'JMD', 'TTD', 'BBD', 'XCD', 'AWG', 'ANG', 'KYD', 'BMD',
      // Other Major Currencies
      'ILS', 'CLF', 'KZT', 'UZS', 'TJS', 'TMT', 'GEL', 'AMD', 'AZN', 'BYN', 'MDL', 'ALL', 'MKD', 'BAM', 'MOP', 'KGS', 'AFN', 'IRR', 'IQD', 'YER', 'SYP'
    ],
    trim: true
  },
  currencySymbol: {
    type: String,
    default: 'Rs.',
    trim: true
  },
  exchangeRate: {
    type: Number,
    default: 1
  },
  
  // Payment Details
  paymentDetails: {
    bankName: {
      type: String,
      trim: true
    },
    accountName: {
      type: String,
      trim: true
    },
    accountNumber: {
      type: String,
      trim: true
    },
    ifscCode: {
      type: String,
      trim: true
    },
    upiId: {
      type: String,
      trim: true
    },
    qrCode: {
      type: String, // URL to QR code image
      trim: true
    }
  },
  
  // Notes and Terms
  notes: {
    type: String,
    trim: true
  },
  terms: {
    type: String,
    trim: true
  },
  
  // Related Records
  relatedSale: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale'
  },
  relatedLead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead'
  },
  
  // Audit Fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Payment Tracking
  payments: [{
    date: {
      type: Date,
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    method: {
      type: String,
      enum: ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Credit Card', 'Debit Card', 'Other'],
      required: true
    },
    reference: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }],
  
  // Email Tracking
  sentDate: {
    type: Date
  },
  sentTo: {
    type: String,
    trim: true
  },
  emailSubject: {
    type: String,
    trim: true
  },
  
  // File Storage
  pdfPath: {
    type: String,
    trim: true
  },
  
  // Soft Delete
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for better performance
InvoiceSchema.index({ invoiceNumber: 1 });
InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ invoiceDate: -1 });
InvoiceSchema.index({ dueDate: 1 });
InvoiceSchema.index({ 'clientInfo.email': 1 });
InvoiceSchema.index({ createdBy: 1 });
InvoiceSchema.index({ isDeleted: 1 });

// Pre-save middleware to calculate totals
InvoiceSchema.pre('save', function(next) {
  try {
    // Ensure items array exists and has valid data
    if (!this.items || !Array.isArray(this.items)) {
      this.items = [];
    }

    // Calculate item totals
    this.items.forEach(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const taxRate = parseFloat(item.taxRate) || 0;
      const discount = parseFloat(item.discount) || 0;
      
      const lineTotal = quantity * unitPrice;
      const discountAmount = item.discountType === 'percentage' 
        ? (lineTotal * discount / 100)
        : discount;
      item.subtotal = lineTotal - discountAmount;
      item.taxAmount = item.subtotal * (taxRate / 100);
      item.total = item.subtotal + item.taxAmount;
    });
    
    // Calculate invoice totals
    this.subtotal = this.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    this.totalDiscount = this.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0) - (item.subtotal || 0)), 0);
    this.totalTax = this.items.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
    this.totalAmount = this.subtotal + this.totalTax;
    this.balanceDue = this.totalAmount - (this.amountPaid || 0);
    
    // Update status based on payment
    if ((this.amountPaid || 0) >= this.totalAmount) {
      this.status = 'Paid';
    } else if ((this.amountPaid || 0) > 0) {
      this.status = 'Partially Paid';
    } else if (this.dueDate && new Date() > this.dueDate && this.status !== 'Draft') {
      this.status = 'Overdue';
    }
    
    next();
  } catch (error) {
    console.error('Error in pre-save middleware:', error);
    next(error);
  }
});

// Static, deletion-resilient, atomic invoice number generator using a counter collection
InvoiceSchema.statics.generateInvoiceNumber = async function() {
  const Counter = require('./Counter');
  const year = new Date().getFullYear();
  const key = `invoice-${year}`;
  // Atomically increment the counter so deletions or race conditions can't reuse numbers
  const updated = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const nextNumber = updated.seq;
  return `INV-${year}-${nextNumber.toString().padStart(3, '0')}`;
};

// Instance method to get amount in words
InvoiceSchema.methods.getAmountInWords = function() {
  const numberToWords = (num) => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    
    if (num === 0) return '';
    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + numberToWords(num % 100) : '');
    if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
    if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numberToWords(num % 100000) : '');
    return numberToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numberToWords(num % 10000000) : '');
  };
  
  const rupees = Math.floor(this.totalAmount);
  const paise = Math.round((this.totalAmount - rupees) * 100);
  
  let words = numberToWords(rupees) + ' Rupees';
  if (paise > 0) {
    words += ' and ' + numberToWords(paise) + ' Paise';
  }
  
  return words + ' Only';
};

module.exports = mongoose.model('Invoice', InvoiceSchema); 