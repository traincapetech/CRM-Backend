const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a lead name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  course: {
    type: String,
    trim: true,
    required: [true, 'Please specify the course']
  },
  countryCode: {
    type: String,
    trim: true,
    required: [true, 'Please add country code']
  },
  phone: {
    type: String,
    required: [true, 'Please add a phone number'],
    maxlength: [20, 'Phone number cannot be longer than 20 characters']
  },
  country: {
    type: String,
    trim: true,
    required: [true, 'Please add the country']
  },
  pseudoId: {
    type: String,
    trim: true
  },
  company: {
    type: String,
    trim: true
  },
  client: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['New', 'Contacted', 'Qualified', 'Lost', 'Converted'],
    default: 'New'
  },
  source: {
    type: String,
    default: ''
  },
  sourceLink: {
    type: String,
    trim: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  leadPerson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  remarks: {
    type: String
  },
  feedback: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Lead', LeadSchema); 