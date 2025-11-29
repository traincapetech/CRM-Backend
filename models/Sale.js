const mongoose = require('mongoose');

const SaleSchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now,
    required: true
  },
  customerName: {
    type: String,
    required: [true, 'Please add a customer name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  country: {
    type: String,
    required: [true, 'Please add a country'],
    trim: true
  },
  course: {
    type: String,
    required: [true, 'Please add a course name'],
    trim: true
  },
  countryCode: {
    type: String,
    trim: true
  },
  contactNumber: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true
  },
  pseudoId: {
    type: String,
    trim: true
  },
  salesPerson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Please assign a sales person']
  },
  leadPerson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Make it optional - we'll handle validation in the controller
  },
  leadBy: {
    type: String,
    trim: true
  },
  loginId: {
    type: String,
    trim: true
  },
  password: {
    type: String,
    trim: true
  },
  source: {
    type: String,
    trim: true
  },
  isReference: {
    type: Boolean,
    default: false
  },
  isLeadPersonSale: {
    type: Boolean,
    default: false
  },
  clientRemark: {
    type: String,
    trim: true
  },
  feedback: {
    type: String,
    trim: true
  },
  totalCost: {
    type: Number,
    default: 0
  },
  totalCostCurrency: {
    type: String,
    default: 'USD',
    trim: true
  },
  tokenAmount: {
    type: Number,
    default: 0
  },
  tokenAmountCurrency: {
    type: String,
    default: 'USD',
    trim: true
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CNY'],
    trim: true
  },
  pending: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['Completed', 'Pending', 'Cancelled'],
    default: 'Pending'
  },
  notes: {
    type: String,
    trim: true
  },
  remarks: {
    type: String,
    trim: true,
    default: '' // Set default value to empty string
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Sale', SaleSchema); 