const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProjectRequirementSchema = new Schema({
  requirementNumber: {
    type: String,
    unique: true,
    index: true
  },
  customerDetails: {
    name: { type: String, required: [true, 'Customer name is required'], trim: true },
    email: { type: String, required: [true, 'Customer email is required'], trim: true, lowercase: true },
    phone: { type: String, trim: true },
    countryCode: { type: String, trim: true },
    country: { type: String, trim: true },
    address: { type: String, trim: true }
  },
  companyDetails: {
    name: { type: String, trim: true },
    website: { type: String, trim: true },
    size: { type: String, trim: true },
    industry: { type: String, trim: true }
  },
  businessInformation: {
    type: Schema.Types.Mixed,
    default: {}
  },
  selectedService: {
    type: String,
    required: [true, 'Selected service is required'],
    trim: true
  },
  allAnswers: [
    {
      question: { type: String, required: true },
      answer: { type: Schema.Types.Mixed }
    }
  ],
  attachments: [
    {
      fileName: { type: String, required: true },
      url: { type: String, required: true },
      key: { type: String }, // R2 bucket key
      uploadedAt: { type: Date, default: Date.now },
      size: { type: Number },
      mimetype: { type: String }
    }
  ],
  budget: {
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'USD', trim: true }
  },
  timeline: {
    type: String,
    trim: true
  },
  currentStatus: {
    type: String,
    enum: ['New', 'Contacted', 'Meeting Scheduled', 'Proposal Sent', 'Negotiation', 'Won', 'Lost', 'Archived'],
    default: 'New',
    index: true
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium',
    index: true
  },
  assignedSalesPerson: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  assignedProjectManager: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  leadReference: {
    type: Schema.Types.ObjectId,
    ref: 'Lead',
    index: true
  },
  source: {
    type: String,
    enum: ['Website', 'CRM', 'Google Form'],
    default: 'Website',
    index: true
  },
  internalNotes: {
    type: String,
    default: ''
  },
  comments: [
    {
      body: { type: String, required: true },
      author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  activityLog: [
    {
      action: { type: String, required: true },
      performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      timestamp: { type: Date, default: Date.now },
      details: { type: String }
    }
  ]
}, {
  timestamps: true
});

// Static method to atomically generate unique requirement numbers (REQ-YYYY-XXXX)
ProjectRequirementSchema.statics.generateRequirementNumber = async function() {
  const Counter = require('./Counter');
  const year = new Date().getFullYear();
  const key = `project-requirement-${year}`;
  
  const updated = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  
  const nextNumber = updated.seq;
  return `REQ-${year}-${nextNumber.toString().padStart(4, '0')}`;
};

module.exports = mongoose.model('ProjectRequirement', ProjectRequirementSchema);
