/**
 * Workflow Automation Model
 * 
 * Defines automated workflows and rules
 */

const mongoose = require('mongoose');

const WorkflowSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Workflow name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  // Trigger configuration
  trigger: {
    type: {
      type: String,
      enum: ['lead_created', 'lead_status_changed', 'sale_created', 'sale_updated', 'user_created', 'schedule', 'manual'],
      required: true
    },
    conditions: {
      status: [String],
      country: [String],
      course: [String],
      dateRange: {
        start: Date,
        end: Date
      },
      custom: mongoose.Schema.Types.Mixed
    },
    schedule: {
      enabled: Boolean,
      cron: String, // Cron expression
      timezone: String
    }
  },
  // Actions to execute
  actions: [{
    type: {
      type: String,
      enum: [
        'send_email',
        'assign_lead',
        'create_task',
        'update_status',
        'send_notification',
        'create_sale',
        'update_field',
        'webhook'
      ],
      required: true
    },
    config: {
      // For send_email
      template: String,
      subject: String,
      recipients: [String],
      
      // For assign_lead
      assignTo: mongoose.Schema.Types.ObjectId,
      
      // For create_task
      taskTitle: String,
      taskDescription: String,
      taskDepartment: String,
      
      // For update_status
      newStatus: String,
      
      // For webhook
      url: String,
      method: String,
      headers: mongoose.Schema.Types.Mixed,
      body: mongoose.Schema.Types.Mixed,
      
      // Generic
      delay: Number, // Delay in seconds before executing
      conditions: mongoose.Schema.Types.Mixed
    },
    order: Number // Execution order
  }],
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'draft'],
    default: 'active'
  },
  // Execution stats
  stats: {
    totalExecutions: { type: Number, default: 0 },
    successfulExecutions: { type: Number, default: 0 },
    failedExecutions: { type: Number, default: 0 },
    lastExecuted: Date
  },
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

// Indexes
WorkflowSchema.index({ status: 1, 'trigger.type': 1 });
WorkflowSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Workflow', WorkflowSchema);

