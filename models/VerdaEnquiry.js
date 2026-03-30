const mongoose = require('mongoose');

const verdaEnquirySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  company: {
    type: String,
    required: false,
    trim: true
  },
  countryCode: {
    type: String,
    required: [true, 'Country code is required'],
    trim: true
  },
  number: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^[0-9]+$/, 'Phone number must contain only digits']
  },
  email: {
    type: String,
    required: false,
    trim: true,
    lowercase: true
  },
  address: {
    type: String,
    required: false,
    trim: true
  },

  interestedProducts: [{
    type: String,
    required: [true, 'At least one product must be selected']
  }],

  status: {
    type: String,
    enum: ['Pending', 'Introduction', 'Acknowledgement', 'Questionnaire', 'Future Promise', 'Payment'],
    default: 'Pending'
  },
  feedback: {
    type: String,
    required: false,
    trim: true
  }
}, {
  timestamps: true
});

const VerdaEnquiry = mongoose.model('VerdaEnquiry', verdaEnquirySchema);

module.exports = VerdaEnquiry;
