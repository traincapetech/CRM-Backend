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
    // Accept any string with @ as a valid email - more permissive to allow international formats
    validate: {
      validator: function(value) {
        // If email is empty, it's valid (email is optional)
        if (!value || value.trim() === '') return true;
        // Otherwise just check for @ symbol
        return value.includes('@');
      },
      message: props => `${props.value} is not a valid email format. Must contain @ symbol.`
    },
    // Don't enforce unique index on email - allow duplicates
    index: false
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
    maxlength: [20, 'Phone number cannot be longer than 20 characters'],
    // Don't enforce unique index on phone - allow duplicates
    index: false
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
    enum: ['New', 'Contacted', 'Qualified', 'Lost', 'Converted', 'Introduction', 'Acknowledgement', 'Question', 'Future Promise', 'Payment', 'Analysis'],
    default: 'Introduction'
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
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  remarks: {
    type: String
  },
  feedback: {
    type: String
  },
  // Fields to track repeat customers
  isRepeatCustomer: {
    type: Boolean,
    default: false
  },
  previousCourses: [{
    type: String,
    trim: true
  }],
  relatedLeads: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// PERFORMANCE OPTIMIZATION: Add indexes for faster queries
LeadSchema.index({ assignedTo: 1, createdAt: -1 });
LeadSchema.index({ leadPerson: 1, createdAt: -1 });
LeadSchema.index({ createdBy: 1, createdAt: -1 });
LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Lead', LeadSchema); 