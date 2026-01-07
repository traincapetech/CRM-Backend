/**
 * Email Campaign Model
 * 
 * Manages email marketing campaigns
 */

const mongoose = require('mongoose');

const EmailCampaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Campaign name is required'],
    trim: true,
    maxlength: [100, 'Campaign name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true
  },
  subject: {
    type: String,
    required: [true, 'Email subject is required'],
    trim: true,
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
  template: {
    type: String,
    required: [true, 'Email template is required']
  },
  // Recipient selection
  recipientType: {
    type: String,
    enum: ['all', 'leads', 'customers', 'segment', 'manual'],
    default: 'leads'
  },
  // Selected courses for course-based filtering (normalized values)
  selectedCourses: [{
    type: String,
    trim: true
  }],
  segmentCriteria: {
    statuses: [String],
    countries: [String],
    courses: [String],
    includeCustomers: { type: Boolean, default: false },
    dateRange: {
      start: Date,
      end: Date
    }
  },
  recipientList: [{
    email: String,
    name: String,
    leadId: mongoose.Schema.Types.ObjectId
  }],
  // Scheduling
  scheduleType: {
    type: String,
    enum: ['immediate', 'scheduled', 'recurring'],
    default: 'immediate'
  },
  scheduledDate: {
    type: Date
  },
  recurring: {
    enabled: { type: Boolean, default: false },
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly'] },
    days: [Number], // For weekly: [1,3,5] = Mon, Wed, Fri
    time: String // HH:mm format
  },
  // Status
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled'],
    default: 'draft'
  },
  // Analytics
  stats: {
    totalRecipients: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 }
  },
  // Tracking
  sentAt: Date,
  completedAt: Date,
  // Creator
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for performance
EmailCampaignSchema.index({ status: 1, scheduledDate: 1 });
EmailCampaignSchema.index({ createdBy: 1, createdAt: -1 });
EmailCampaignSchema.index({ 'stats.sent': -1 });

// Methods
EmailCampaignSchema.methods.calculateOpenRate = function() {
  if (this.stats.delivered === 0) return 0;
  return (this.stats.opened / this.stats.delivered) * 100;
};

EmailCampaignSchema.methods.calculateClickRate = function() {
  if (this.stats.delivered === 0) return 0;
  return (this.stats.clicked / this.stats.delivered) * 100;
};

module.exports = mongoose.model('EmailCampaign', EmailCampaignSchema);

