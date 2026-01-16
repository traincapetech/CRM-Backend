/**
 * Email Campaign Controller
 * 
 * Handles email campaign operations
 */

const EmailCampaign = require('../models/EmailCampaign');
const EmailTemplate = require('../models/EmailTemplate');
const Lead = require('../models/Lead');
const Sale = require('../models/Sale');
const { sendEmail } = require('../config/nodemailer');
const { buildTemplateVariables, replaceTemplateVariables } = require('../utils/templateVariables');
const { addEmailTracking } = require('../utils/emailTracking');

const isAdminOrManager = (user) => ['Admin', 'Manager'].includes(user.role);

const canAccessCampaign = (req, campaign) => {
  if (isAdminOrManager(req.user)) return true;
  if (req.user.role === 'Lead Person') {
    const createdById = campaign.createdBy?._id
      ? campaign.createdBy._id.toString()
      : campaign.createdBy?.toString();
    return createdById === req.user.id;
  }
  return false;
};

// Helper function to normalize course value
const normalizeCourse = (course) => {
  if (!course) return '';
  return course.trim().toLowerCase();
};

// Helper function to validate email
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed === '') return false;
  // Basic email validation - must contain @ and have valid format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
};

// @desc    Get all campaigns
// @route   GET /api/email-campaigns
// @access  Private (Admin, Manager)
exports.getCampaigns = async (req, res) => {
  try {
    const campaigns = await EmailCampaign.find({ createdBy: req.user.id })
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: campaigns.length,
      data: campaigns
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single campaign
// @route   GET /api/email-campaigns/:id
// @access  Private
exports.getCampaign = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id)
      .populate('createdBy', 'fullName email');

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    if (!canAccessCampaign(req, campaign)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this campaign'
      });
    }

    res.status(200).json({
      success: true,
      data: campaign
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create new campaign
// @route   POST /api/email-campaigns
// @access  Private (Admin, Manager)
exports.createCampaign = async (req, res) => {
  try {
    req.body.createdBy = req.user.id;
    const campaign = await EmailCampaign.create(req.body);

    res.status(201).json({
      success: true,
      data: campaign
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update campaign
// @route   PUT /api/email-campaigns/:id
// @access  Private
exports.updateCampaign = async (req, res) => {
  try {
    req.body.updatedBy = req.user.id;
    const existingCampaign = await EmailCampaign.findById(req.params.id);

    if (!existingCampaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    if (!canAccessCampaign(req, existingCampaign)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this campaign'
      });
    }

    existingCampaign.set(req.body);
    const campaign = await existingCampaign.save();

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    res.status(200).json({
      success: true,
      data: campaign
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Send campaign
// @route   POST /api/email-campaigns/:id/send
// @access  Private
exports.sendCampaign = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    if (!canAccessCampaign(req, campaign)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send this campaign'
      });
    }

    // Get recipients based on recipientType
    let recipients = [];
    let totalMatchedLeads = 0;
    let validEmailLeads = 0;
    let skippedNoEmailLeads = 0;
    let segmentCounts = {
      leadsMatched: 0,
      leadsValidEmails: 0,
      customersMatched: 0,
      customersValidEmails: 0
    };
    
    if (campaign.recipientType === 'all' || campaign.recipientType === 'leads') {
      let query = {};
      
      // For "leads" type, courses are required
      if (campaign.recipientType === 'leads') {
        if (!campaign.selectedCourses || !Array.isArray(campaign.selectedCourses) || campaign.selectedCourses.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Please select at least one course for "All Leads" or use Manual List.'
          });
        }
      }
      
      // If courses are selected, filter by courses (for both "all" and "leads")
      if (campaign.selectedCourses && Array.isArray(campaign.selectedCourses) && campaign.selectedCourses.length > 0) {
        // Normalize course values
        const normalizedCourses = campaign.selectedCourses.map(c => normalizeCourse(c));
        // Build case-insensitive regex for matching
        const courseRegex = new RegExp(normalizedCourses.map(c => `^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).join('|'), 'i');
        query.course = { $regex: courseRegex };
      }
      
      // For "all" type without courses, get all leads (no course filter)

      // Get all matching leads
      const allLeads = await Lead.find(query).select('name email course country company').lean();
      totalMatchedLeads = allLeads.length;

      // Filter leads with valid emails
      recipients = allLeads
        .filter(lead => isValidEmail(lead.email))
        .map(lead => ({
          email: lead.email.trim(),
          name: lead.name,
          leadId: lead._id,
          course: lead.course,
          country: lead.country,
          company: lead.company
        }));

      validEmailLeads = recipients.length;
      skippedNoEmailLeads = totalMatchedLeads - validEmailLeads;

      // Validate that we have valid recipients
      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid email recipients found for selected course(s).',
          data: {
            totalMatchedLeads,
            validEmailLeads: 0,
            skippedNoEmailLeads
          }
        });
      }
    } else if (campaign.recipientType === 'customers') {
      const sales = await Sale.find({}).select('customerName email course country');
      recipients = sales
        .filter(sale => isValidEmail(sale.email))
        .map(sale => ({
          email: sale.email.trim(),
          name: sale.customerName,
          course: sale.course,
          country: sale.country
        }));
      
      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid email recipients found in customers.'
        });
      }
    } else if (campaign.recipientType === 'manual') {
      // Validate manual list emails
      recipients = (campaign.recipientList || [])
        .filter(recipient => isValidEmail(recipient.email))
        .map(recipient => ({
          email: recipient.email.trim(),
          name: recipient.name || recipient.email.split('@')[0]
        }));
      
      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Manual list campaigns must have at least one valid email address.'
        });
      }
    } else if (campaign.recipientType === 'segment') {
      const criteria = campaign.segmentCriteria || {};
      const { statuses = [], countries = [], courses = [], includeCustomers = false, dateRange = {} } = criteria;

      const hasFilters =
        statuses.length > 0 ||
        countries.length > 0 ||
        courses.length > 0 ||
        dateRange.start ||
        dateRange.end ||
        includeCustomers;

      if (!hasFilters) {
        return res.status(400).json({
          success: false,
          message: 'Please add at least one filter or include customers.'
        });
      }

      // Build lead query
      const leadQuery = {};
      if (statuses.length > 0) {
        leadQuery.status = { $in: statuses };
      }
      if (countries.length > 0) {
        leadQuery.country = { $in: countries.map(c => new RegExp(`^${c.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'i')) };
      }
      if (courses.length > 0) {
        const normalizedCourses = courses.map(c => normalizeCourse(c));
        const courseRegex = new RegExp(normalizedCourses.map(c => `^${c.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`).join('|'), 'i');
        leadQuery.course = { $regex: courseRegex };
      }
      if (dateRange.start || dateRange.end) {
        leadQuery.createdAt = {};
        if (dateRange.start) leadQuery.createdAt.$gte = new Date(dateRange.start);
        if (dateRange.end) leadQuery.createdAt.$lte = new Date(dateRange.end);
      }

      const segmentLeads = await Lead.find(leadQuery).select('name email course country company createdAt').lean();
      segmentCounts.leadsMatched = segmentLeads.length;

      const validLeadRecipients = segmentLeads
        .filter(lead => isValidEmail(lead.email))
        .map(lead => ({
          email: lead.email.trim(),
          name: lead.name,
          leadId: lead._id,
          course: lead.course,
          country: lead.country,
          company: lead.company
        }));

      segmentCounts.leadsValidEmails = validLeadRecipients.length;

      let customerRecipients = [];
      if (includeCustomers) {
        const customerQuery = {};
        if (countries.length > 0) {
          customerQuery.country = { $in: countries.map(c => new RegExp(`^${c.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'i')) };
        }
        if (courses.length > 0) {
          const normalizedCourses = courses.map(c => normalizeCourse(c));
          const courseRegex = new RegExp(normalizedCourses.map(c => `^${c.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`).join('|'), 'i');
          customerQuery.course = { $regex: courseRegex };
        }
        if (dateRange.start || dateRange.end) {
          customerQuery.date = {};
          if (dateRange.start) customerQuery.date.$gte = new Date(dateRange.start);
          if (dateRange.end) customerQuery.date.$lte = new Date(dateRange.end);
        }

        const sales = await Sale.find(customerQuery).select('customerName email course country date').lean();
        segmentCounts.customersMatched = sales.length;

        customerRecipients = sales
          .filter(sale => isValidEmail(sale.email))
          .map(sale => ({
            email: sale.email.trim(),
            name: sale.customerName,
            course: sale.course,
            country: sale.country
          }));

        segmentCounts.customersValidEmails = customerRecipients.length;
      }

      recipients = [...validLeadRecipients, ...customerRecipients];
      totalMatchedLeads = segmentCounts.leadsMatched + segmentCounts.customersMatched;
      validEmailLeads = recipients.length;
      skippedNoEmailLeads = totalMatchedLeads - validEmailLeads;

      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid email recipients found for the selected segment filters.',
          data: {
            totalMatchedLeads,
            validEmailLeads: 0,
            skippedNoEmailLeads
          }
        });
      }
    }

    // Update campaign status
    campaign.status = 'sending';
    campaign.stats.totalRecipients = recipients.length;
    await campaign.save();

    const senderName = req.user?.fullName || process.env.FROM_NAME || 'Traincape Team';
    const preparedRecipients = recipients.map((recipient) => ({
      ...recipient,
      counselor_name: senderName
    }));

    // Use email queue for sending (if available) or fallback to synchronous sending
    const { queueEmails } = require('../services/emailQueue');
    
    try {
      // Try to use queue system
      const queueResult = await queueEmails(
        preparedRecipients,
        campaign._id.toString(),
        campaign.subject,
        campaign.template,
        campaign.template.replace(/<[^>]*>/g, ''), // Plain text version
        50, // Batch size: 50 emails per batch
        1000 // Delay: 1 second between batches (rate limiting)
      );

      console.log(`📬 Queued ${queueResult.totalQueued} emails in ${queueResult.batches} batches`);

      // Update campaign with initial stats
      campaign.stats.sent = 0; // Will be updated by queue workers
      campaign.stats.delivered = 0;
      campaign.stats.bounced = 0;
      campaign.sentAt = new Date();
      await campaign.save();

      res.status(200).json({
        success: true,
        message: `Campaign queued. ${queueResult.totalQueued} emails will be sent in background.`,
        data: {
          queued: queueResult.totalQueued,
          batches: queueResult.batches,
          totalMatchedLeads: campaign.recipientType === 'leads' || campaign.recipientType === 'all' ? totalMatchedLeads : undefined,
          validEmailLeads: campaign.recipientType === 'leads' || campaign.recipientType === 'all' ? validEmailLeads : undefined,
          skippedNoEmailLeads: campaign.recipientType === 'leads' || campaign.recipientType === 'all' ? skippedNoEmailLeads : undefined,
          segment: campaign.recipientType === 'segment'
            ? {
                leadsMatched: segmentCounts.leadsMatched,
                leadsValidEmails: segmentCounts.leadsValidEmails,
                customersMatched: segmentCounts.customersMatched,
                customersValidEmails: segmentCounts.customersValidEmails
              }
            : undefined
        }
      });
      return;
    } catch (queueError) {
      console.warn('Queue system not available, falling back to synchronous sending:', queueError.message);
      
      // Fallback to synchronous sending (for small campaigns or when queue is unavailable)
      let sent = 0;
      let delivered = 0;
      let bounced = 0;

      // Rate limiting: send in batches with delays
      const batchSize = 10; // Smaller batches for synchronous sending
      const delayBetweenBatches = 2000; // 2 seconds between batches

      for (let i = 0; i < preparedRecipients.length; i += batchSize) {
        const batch = preparedRecipients.slice(i, i + batchSize);
        
        for (const recipient of batch) {
          try {
            // Replace template variables
            const variables = buildTemplateVariables(recipient, {
              fromName: req.user?.fullName
            });
            const htmlContent = addEmailTracking(
              replaceTemplateVariables(campaign.template, variables),
              campaign._id.toString(),
              recipient.email
            );
            const subject = replaceTemplateVariables(campaign.subject, variables);

            await sendEmail(
              recipient.email,
              subject,
              htmlContent.replace(/<[^>]*>/g, ''), // Plain text version
              htmlContent
            );

            sent++;
            delivered++;
          } catch (error) {
            console.error(`Failed to send to ${recipient.email}:`, error);
            sent++;
            bounced++;
          }
        }

        // Delay between batches (except for the last batch)
        if (i + batchSize < recipients.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      // Update campaign stats
      campaign.status = 'sent';
      campaign.stats.sent = sent;
      campaign.stats.delivered = delivered;
      campaign.stats.bounced = bounced;
      campaign.sentAt = new Date();
      campaign.completedAt = new Date();
      await campaign.save();

      res.status(200).json({
        success: true,
        message: `Campaign sent to ${sent} recipients`,
        data: {
          sent,
          delivered,
          bounced,
          totalMatchedLeads: campaign.recipientType === 'leads' || campaign.recipientType === 'all' ? totalMatchedLeads : undefined,
          validEmailLeads: campaign.recipientType === 'leads' || campaign.recipientType === 'all' ? validEmailLeads : undefined,
          skippedNoEmailLeads: campaign.recipientType === 'leads' || campaign.recipientType === 'all' ? skippedNoEmailLeads : undefined,
          segment: campaign.recipientType === 'segment'
            ? {
                leadsMatched: segmentCounts.leadsMatched,
                leadsValidEmails: segmentCounts.leadsValidEmails,
                customersMatched: segmentCounts.customersMatched,
                customersValidEmails: segmentCounts.customersValidEmails
              }
            : undefined
        }
      });
    } // End of catch (queueError) block
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get campaign analytics
// @route   GET /api/email-campaigns/:id/analytics
// @access  Private
exports.getCampaignAnalytics = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id)
      .populate('createdBy', 'fullName email');

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    if (!canAccessCampaign(req, campaign)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this campaign'
      });
    }

    const stats = campaign.stats || {};
    const openRate = campaign.calculateOpenRate();
    const clickRate = campaign.calculateClickRate();
    const deliveryRate = stats.sent > 0 ? ((stats.delivered / stats.sent) * 100) : 0;
    const bounceRate = stats.sent > 0 ? ((stats.bounced / stats.sent) * 100) : 0;
    const unsubscribeRate = stats.delivered > 0 ? ((stats.unsubscribed / stats.delivered) * 100) : 0;

    // Calculate engagement score (weighted metric)
    const engagementScore = (
      (openRate * 0.4) + 
      (clickRate * 0.6)
    ).toFixed(2);

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        openRate: parseFloat(openRate.toFixed(2)),
        clickRate: parseFloat(clickRate.toFixed(2)),
        deliveryRate: parseFloat(deliveryRate.toFixed(2)),
        bounceRate: parseFloat(bounceRate.toFixed(2)),
        unsubscribeRate: parseFloat(unsubscribeRate.toFixed(2)),
        engagementScore: parseFloat(engagementScore),
        campaign: {
          name: campaign.name,
          subject: campaign.subject,
          status: campaign.status,
          recipientType: campaign.recipientType,
          sentAt: campaign.sentAt,
          completedAt: campaign.completedAt,
          createdAt: campaign.createdAt
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Track email open
// @route   GET /api/email-campaigns/track/open
// @access  Public
exports.trackOpen = async (req, res) => {
  try {
    const campaignId = req.query.c;
    if (campaignId) {
      await EmailCampaign.findByIdAndUpdate(campaignId, {
        $inc: { 'stats.opened': 1 }
      });
    }
  } catch (error) {
    // Swallow errors to avoid breaking email clients
  } finally {
    const img = Buffer.from(
      'R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
      'base64'
    );
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(img);
  }
};

// @desc    Track email click and redirect
// @route   GET /api/email-campaigns/track/click
// @access  Public
exports.trackClick = async (req, res) => {
  const campaignId = req.query.c;
  const redirectUrl = req.query.u;

  try {
    if (campaignId) {
      await EmailCampaign.findByIdAndUpdate(campaignId, {
        $inc: { 'stats.clicked': 1 }
      });
    }
  } catch (error) {
    // ignore tracking errors
  }

  if (!redirectUrl) {
    return res.status(400).send('Missing redirect URL');
  }

  return res.redirect(redirectUrl);
};

// @desc    Delete campaign
// @route   DELETE /api/email-campaigns/:id
// @access  Private
exports.deleteCampaign = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    if (!canAccessCampaign(req, campaign)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this campaign'
      });
    }

    await campaign.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Campaign deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get unique courses from leads
// @route   GET /api/email-campaigns/courses/available
// @access  Private
exports.getAvailableCourses = async (req, res) => {
  try {
    console.log('📚 Fetching available courses from leads...');
    
    // Get all unique course values from leads - simplified query
    // The course field exists and is a string, so we can query directly
    const leads = await Lead.find({
      course: { $exists: true, $ne: null, $ne: '' }
    })
      .select('course')
      .lean();

    console.log(`📊 Found ${leads.length} leads with course information`);

    // Create a map to store normalized -> formatted mapping
    const courseMap = new Map();

    leads.forEach(lead => {
      if (lead.course && typeof lead.course === 'string') {
        const trimmed = lead.course.trim();
        if (trimmed !== '') {
          const normalized = normalizeCourse(trimmed);
          const formatted = trimmed;
          
          // Keep the most common formatted version (or first encountered)
          if (!courseMap.has(normalized)) {
            courseMap.set(normalized, formatted);
          }
        }
      }
    });

    // Convert map to array of { value, label } objects
    const courses = Array.from(courseMap.entries()).map(([value, label]) => ({
      value,
      label
    })).sort((a, b) => a.label.localeCompare(b.label));

    console.log(`✅ Found ${courses.length} unique courses:`, courses.map(c => c.label).join(', '));

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses
    });
  } catch (error) {
    console.error('❌ Error fetching available courses:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get recipient counts for course selection
// @route   POST /api/email-campaigns/courses/preview
// @access  Private
exports.previewCourseRecipients = async (req, res) => {
  try {
    const { courses } = req.body;

    if (!courses || !Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one course'
      });
    }

    // Normalize course values
    const normalizedCourses = courses.map(c => normalizeCourse(c));

    // Build query for case-insensitive matching
    const courseRegex = new RegExp(normalizedCourses.map(c => `^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).join('|'), 'i');
    
    // Get all leads matching the courses (case-insensitive)
    const allLeads = await Lead.find({
      course: { $regex: courseRegex }
    }).select('name email course').lean();

    // Filter leads with valid emails
    const validEmailLeads = allLeads.filter(lead => isValidEmail(lead.email));
    const skippedNoEmail = allLeads.length - validEmailLeads.length;

    res.status(200).json({
      success: true,
      data: {
        totalMatchedLeads: allLeads.length,
        validEmailLeads: validEmailLeads.length,
        skippedNoEmailLeads: skippedNoEmail
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

