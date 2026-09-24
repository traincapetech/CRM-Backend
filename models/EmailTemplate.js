/**
 * Email Template Model
 * 
 * Stores reusable email templates
 */

const mongoose = require('mongoose');

const EmailTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Template name is required'],
    trim: true,
    unique: true
  },
  category: {
    type: String,
    enum: ['marketing', 'transactional', 'notification', 'newsletter'],
    default: 'marketing'
  },
  subject: {
    type: String,
    required: [true, 'Email subject is required'],
    trim: true
  },
  // HTML content with variables
  htmlContent: {
    type: String,
    required: [true, 'HTML content is required']
  },
  // Plain text version
  textContent: {
    type: String
  },
  // Available variables (e.g., {{name}}, {{email}}, {{company}})
  variables: [{
    name: String,
    description: String,
    example: String
  }],
  // Preview image
  previewImage: String,
  // Usage stats
  usageCount: {
    type: Number,
    default: 0
  },
  lastUsed: Date,
  // Creator
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
EmailTemplateSchema.index({ category: 1, isActive: 1 });
EmailTemplateSchema.index({ name: 1 });

module.exports = mongoose.model('EmailTemplate', EmailTemplateSchema);

