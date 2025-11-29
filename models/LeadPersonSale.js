const mongoose = require('mongoose');

const LeadPersonSaleSchema = new mongoose.Schema({
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
    required: [true, 'Please add a contact number'],
    trim: true
  },
  email: {
    type: String,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
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
    required: [true, 'Please assign a lead person']
  },
  source: {
    type: String,
    trim: true
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
  status: {
    type: String,
    enum: ['Completed', 'Pending', 'Cancelled'],
    default: 'Pending'
  },
  notes: {
    type: String,
    trim: true
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

module.exports = mongoose.model('LeadPersonSale', LeadPersonSaleSchema); 