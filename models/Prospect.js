const mongoose = require('mongoose');

const prospectSchema = new mongoose.Schema({
  // Basic Information (all optional)
  name: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  company: {
    type: String,
    trim: true
  },
  designation: {
    type: String,
    trim: true
  },
  
  // Source Information
  source: {
    type: String,
    enum: ['LinkedIn', 'Website', 'Referral', 'Cold Call', 'Email Campaign', 'Social Media', 'Event', 'Other'],
    default: 'Other'
  },
  sourceDetails: {
    type: String,
    trim: true
  },
  
  // Business Information
  industry: {
    type: String,
    trim: true
  },
  companySize: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+', 'Unknown'],
    default: 'Unknown'
  },
  budget: {
    type: Number,
    min: 0
  },
  budgetCurrency: {
    type: String,
    default: 'USD'
  },
  
  // Interest & Requirements
  serviceInterest: {
    type: String,
    trim: true
  },
  requirements: {
    type: String,
    trim: true
  },
  timeline: {
    type: String,
    enum: ['Immediate', 'Within 1 month', '1-3 months', '3-6 months', '6+ months', 'Not specified'],
    default: 'Not specified'
  },
  
  // Status & Priority
  status: {
    type: String,
    enum: ['New', 'Contacted', 'Interested', 'Not Interested', 'Follow Up', 'Qualified', 'Converted to Lead', 'Lost'],
    default: 'New'
  },
  priority: {
    type: String,
    enum: ['High', 'Medium', 'Low'],
    default: 'Medium'
  },
  
  // Assignment & Tracking
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  leadBy: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Follow-up Information
  lastContactDate: {
    type: Date
  },
  nextFollowUpDate: {
    type: Date
  },
  contactMethod: {
    type: String,
    enum: ['Email', 'Phone', 'LinkedIn', 'WhatsApp', 'Meeting', 'Other']
  },
  
  // Notes & Communication
  notes: {
    type: String,
    trim: true
  },
  remark: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  
  // Conversion tracking
  convertedToLead: {
    type: Boolean,
    default: false
  },
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead'
  },
  conversionDate: {
    type: Date
  },
  
  // Social Media Links
  linkedinProfile: {
    type: String,
    trim: true
  },
  websiteUrl: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
prospectSchema.index({ email: 1 });
prospectSchema.index({ phone: 1 });
prospectSchema.index({ assignedTo: 1 });
prospectSchema.index({ createdBy: 1 });
prospectSchema.index({ status: 1 });
prospectSchema.index({ source: 1 });
prospectSchema.index({ createdAt: -1 });

// Virtual for full contact info
prospectSchema.virtual('fullContactInfo').get(function() {
  const contact = [];
  if (this.email) contact.push(this.email);
  if (this.phone) contact.push(this.phone);
  return contact.join(' | ');
});

// Method to convert prospect to lead
prospectSchema.methods.convertToLead = function() {
  return {
    name: this.name,
    email: this.email,
    phone: this.phone,
    company: this.company,
    source: this.source,
    budget: this.budget,
    requirements: this.requirements,
    assignedTo: this.assignedTo,
    createdBy: this.createdBy,
    notes: `Converted from Prospect. Original notes: ${this.notes || 'None'}`
  };
};

module.exports = mongoose.model('Prospect', prospectSchema); 