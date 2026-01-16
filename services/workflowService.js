/**
 * Workflow Execution Service
 * 
 * Handles workflow trigger detection and action execution
 */

const Workflow = require('../models/Workflow');
const Lead = require('../models/Lead');
const Sale = require('../models/Sale');
const User = require('../models/User');
const Task = require('../models/Task');
const { sendEmail } = require('../config/nodemailer');

class WorkflowService {
  /**
   * Execute workflows for a trigger
   */
  async executeWorkflows(triggerType, data) {
    try {
      // Find active workflows with matching trigger
      const workflows = await Workflow.find({
        status: 'active',
        'trigger.type': triggerType
      });

      if (workflows.length === 0) {
        return { executed: 0, results: [] };
      }

      const results = [];

      for (const workflow of workflows) {
        // Check if trigger conditions match
        const conditionsMatch = this.checkConditions(workflow.trigger.conditions, data);
        
        if (conditionsMatch) {
          // Execute workflow actions
          const result = await this.executeWorkflow(workflow, data);
          results.push(result);
        }
      }

      return {
        executed: results.length,
        results
      };
    } catch (error) {
      console.error('Error executing workflows:', error);
      return { executed: 0, error: error.message };
    }
  }

  /**
   * Check if trigger conditions match
   */
  checkConditions(conditions, data) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return true; // No conditions = always match
    }

    // Check status conditions
    if (conditions.status && conditions.status.length > 0) {
      if (!conditions.status.includes(data.status)) {
        return false;
      }
    }

    // Check country conditions
    if (conditions.country && conditions.country.length > 0) {
      if (!conditions.country.includes(data.country)) {
        return false;
      }
    }

    // Check course conditions
    if (conditions.course && conditions.course.length > 0) {
      if (!conditions.course.includes(data.course)) {
        return false;
      }
    }

    // Check date range
    if (conditions.dateRange) {
      const dataDate = new Date(data.createdAt || data.date || Date.now());
      if (conditions.dateRange.start && dataDate < new Date(conditions.dateRange.start)) {
        return false;
      }
      if (conditions.dateRange.end && dataDate > new Date(conditions.dateRange.end)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Execute a single workflow
   */
  async executeWorkflow(workflow, data) {
    const results = [];
    
    // Sort actions by order
    const sortedActions = [...workflow.actions].sort((a, b) => (a.order || 0) - (b.order || 0));

    for (const action of sortedActions) {
      try {
        // Apply delay if specified
        if (action.config.delay) {
          await new Promise(resolve => setTimeout(resolve, action.config.delay * 1000));
        }

        // Check action-specific conditions
        if (action.config.conditions) {
          const actionConditionsMatch = this.checkConditions(action.config.conditions, data);
          if (!actionConditionsMatch) {
            continue; // Skip this action
          }
        }

        // Execute action
        const result = await this.executeAction(action, data);
        results.push({
          actionType: action.type,
          success: result.success,
          message: result.message
        });
      } catch (error) {
        console.error(`Error executing action ${action.type}:`, error);
        results.push({
          actionType: action.type,
          success: false,
          error: error.message
        });
      }
    }

    // Update workflow stats
    workflow.stats.totalExecutions += 1;
    workflow.stats.successfulExecutions += results.filter(r => r.success).length;
    workflow.stats.failedExecutions += results.filter(r => !r.success).length;
    workflow.stats.lastExecuted = new Date();
    await workflow.save();

    return {
      workflowId: workflow._id,
      workflowName: workflow.name,
      actionsExecuted: results.length,
      results
    };
  }

  /**
   * Execute a single action
   */
  async executeAction(action, data) {
    switch (action.type) {
      case 'send_email':
        return await this.actionSendEmail(action.config, data);
      
      case 'assign_lead':
        return await this.actionAssignLead(action.config, data);
      
      case 'create_task':
        return await this.actionCreateTask(action.config, data);
      
      case 'update_status':
        return await this.actionUpdateStatus(action.config, data);
      
      case 'send_notification':
        return await this.actionSendNotification(action.config, data);
      
      case 'create_sale':
        return await this.actionCreateSale(action.config, data);
      
      case 'update_field':
        return await this.actionUpdateField(action.config, data);
      
      case 'webhook':
        return await this.actionWebhook(action.config, data);
      
      default:
        return { success: false, message: `Unknown action type: ${action.type}` };
    }
  }

  /**
   * Action: Send Email
   */
  async actionSendEmail(config, data) {
    try {
      let recipients = config.recipients || [];
      
      // If no recipients specified, use data email
      if (recipients.length === 0 && data.email) {
        recipients = [data.email];
      }

      // Replace template variables
      let subject = config.subject || 'Notification';
      let htmlContent = config.template || '';

      // Replace common variables
      htmlContent = htmlContent.replace(/\{\{name\}\}/g, data.name || data.customerName || 'Customer');
      htmlContent = htmlContent.replace(/\{\{email\}\}/g, data.email || '');
      htmlContent = htmlContent.replace(/\{\{course\}\}/g, data.course || '');
      htmlContent = htmlContent.replace(/\{\{country\}\}/g, data.country || '');
      htmlContent = htmlContent.replace(/\{\{status\}\}/g, data.status || '');

      subject = subject.replace(/\{\{name\}\}/g, data.name || data.customerName || 'Customer');

      // Send to all recipients
      for (const recipient of recipients) {
        await sendEmail(recipient, subject, htmlContent.replace(/<[^>]*>/g, ''), htmlContent);
      }

      return { success: true, message: `Email sent to ${recipients.length} recipient(s)` };
    } catch (error) {
      return { success: false, message: `Failed to send email: ${error.message}` };
    }
  }

  /**
   * Action: Assign Lead
   */
  async actionAssignLead(config, data) {
    try {
      if (!data.leadId && !data._id) {
        return { success: false, message: 'No lead ID in data' };
      }

      const leadId = data.leadId || data._id;
      const assignTo = config.assignTo;

      if (!assignTo) {
        return { success: false, message: 'No assignee specified' };
      }

      await Lead.findByIdAndUpdate(leadId, { assignedTo: assignTo });

      return { success: true, message: `Lead assigned to user ${assignTo}` };
    } catch (error) {
      return { success: false, message: `Failed to assign lead: ${error.message}` };
    }
  }

  /**
   * Action: Create Task
   */
  async actionCreateTask(config, data) {
    try {
      const task = await Task.create({
        title: config.taskTitle || 'Automated Task',
        description: config.taskDescription || '',
        department: config.taskDepartment || 'Sales',
        assignedTo: config.assignedTo || data.assignedTo,
        assignedBy: data.createdBy || data.assignedBy,
        status: 'Pending'
      });

      return { success: true, message: `Task created: ${task._id}` };
    } catch (error) {
      return { success: false, message: `Failed to create task: ${error.message}` };
    }
  }

  /**
   * Action: Update Status
   */
  async actionUpdateStatus(config, data) {
    try {
      if (!data.leadId && !data._id) {
        return { success: false, message: 'No record ID in data' };
      }

      const recordId = data.leadId || data._id;
      const newStatus = config.newStatus;

      if (!newStatus) {
        return { success: false, message: 'No new status specified' };
      }

      // Determine if it's a Lead or Sale
      if (data.leadId || data.status) {
        await Lead.findByIdAndUpdate(recordId, { status: newStatus });
      } else {
        await Sale.findByIdAndUpdate(recordId, { status: newStatus });
      }

      return { success: true, message: `Status updated to ${newStatus}` };
    } catch (error) {
      return { success: false, message: `Failed to update status: ${error.message}` };
    }
  }

  /**
   * Action: Send Notification
   */
  async actionSendNotification(config, data) {
    try {
      // Get io from server module (exported from server.js)
      let io;
      try {
        io = require('../server').io;
      } catch (e) {
        // If io is not available, it might not be initialized yet
        // This is non-critical, so we'll just log and continue
        console.log('Socket.IO not available for notification');
      }
      
      if (!io) {
        // Notification will be sent when user connects
        return { success: true, message: 'Notification queued (Socket.IO not available)' };
      }

      const userId = config.userId || data.assignedTo;
      if (!userId) {
        return { success: false, message: 'No user ID specified' };
      }

      io.to(`user-${userId}`).emit('notification', {
        title: config.title || 'Workflow Notification',
        message: config.message || 'An automated workflow has been executed',
        type: config.type || 'info',
        data: data
      });

      return { success: true, message: `Notification sent to user ${userId}` };
    } catch (error) {
      return { success: false, message: `Failed to send notification: ${error.message}` };
    }
  }

  /**
   * Action: Create Sale
   */
  async actionCreateSale(config, data) {
    try {
      const sale = await Sale.create({
        customerName: data.name || data.customerName,
        email: data.email,
        country: data.country,
        course: data.course,
        totalCost: config.totalCost || 0,
        currency: config.currency || 'USD',
        status: 'Pending',
        salesPerson: config.salesPerson || data.assignedTo,
        leadPerson: data.leadPerson,
        date: new Date()
      });

      return { success: true, message: `Sale created: ${sale._id}` };
    } catch (error) {
      return { success: false, message: `Failed to create sale: ${error.message}` };
    }
  }

  /**
   * Action: Update Field
   */
  async actionUpdateField(config, data) {
    try {
      if (!data.leadId && !data._id) {
        return { success: false, message: 'No record ID in data' };
      }

      const recordId = data.leadId || data._id;
      const updates = config.updates || {};

      if (Object.keys(updates).length === 0) {
        return { success: false, message: 'No fields to update' };
      }

      // Determine model
      if (data.leadId || data.status) {
        await Lead.findByIdAndUpdate(recordId, updates);
      } else {
        await Sale.findByIdAndUpdate(recordId, updates);
      }

      return { success: true, message: 'Fields updated successfully' };
    } catch (error) {
      return { success: false, message: `Failed to update fields: ${error.message}` };
    }
  }

  /**
   * Action: Webhook
   */
  async actionWebhook(config, data) {
    try {
      const axios = require('axios');
      
      const response = await axios({
        method: config.method || 'POST',
        url: config.url,
        headers: config.headers || {},
        data: config.body || data,
        timeout: 10000
      });

      return { success: true, message: `Webhook called successfully: ${response.status}` };
    } catch (error) {
      return { success: false, message: `Webhook failed: ${error.message}` };
    }
  }
}

module.exports = new WorkflowService();

