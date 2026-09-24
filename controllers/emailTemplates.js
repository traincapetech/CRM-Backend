/**
 * Email Template Controller
 * 
 * Handles email template CRUD operations
 */

const EmailTemplate = require('../models/EmailTemplate');
const { buildTemplateVariables, replaceTemplateVariables } = require('../utils/templateVariables');

const isAdminOrManager = (user) => ['Admin', 'Manager'].includes(user.role);

const canModifyTemplate = (req, template) => {
  if (isAdminOrManager(req.user)) return true;
  if (req.user.role === 'Lead Person') {
    return template.createdBy?.toString() === req.user.id;
  }
  return false;
};

// @desc    Get all templates
// @route   GET /api/email-templates
// @access  Private
exports.getTemplates = async (req, res) => {
  try {
    const { category, search, isActive } = req.query;
    
    // Build query
    const query = {};
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } }
      ];
    }

    const templates = await EmailTemplate.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: templates.length,
      data: templates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single template
// @route   GET /api/email-templates/:id
// @access  Private
exports.getTemplate = async (req, res) => {
  try {
    const template = await EmailTemplate.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create template
// @route   POST /api/email-templates
// @access  Private
exports.createTemplate = async (req, res) => {
  try {
    const { name, category, subject, htmlContent, textContent, variables, previewImage } = req.body;

    // Validate required fields
    if (!name || !subject || !htmlContent) {
      return res.status(400).json({
        success: false,
        message: 'Name, subject, and HTML content are required'
      });
    }

    // Check if template name already exists
    const existingTemplate = await EmailTemplate.findOne({ name });
    if (existingTemplate) {
      return res.status(400).json({
        success: false,
        message: 'Template name already exists'
      });
    }

    const template = await EmailTemplate.create({
      name,
      category: category || 'marketing',
      subject,
      htmlContent,
      textContent: textContent || htmlContent.replace(/<[^>]*>/g, ''), // Auto-generate plain text if not provided
      variables: variables || [],
      previewImage,
      createdBy: req.user.id,
      isActive: true
    });

    const populatedTemplate = await EmailTemplate.findById(template._id)
      .populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      data: populatedTemplate
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update template
// @route   PUT /api/email-templates/:id
// @access  Private
exports.updateTemplate = async (req, res) => {
  try {
    const { name, category, subject, htmlContent, textContent, variables, previewImage, isActive } = req.body;

    const template = await EmailTemplate.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    if (!canModifyTemplate(req, template)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this template'
      });
    }

    // Check if name is being changed and if it conflicts with another template
    if (name && name !== template.name) {
      const existingTemplate = await EmailTemplate.findOne({ name });
      if (existingTemplate) {
        return res.status(400).json({
          success: false,
          message: 'Template name already exists'
        });
      }
    }

    // Update fields
    if (name) template.name = name;
    if (category) template.category = category;
    if (subject) template.subject = subject;
    if (htmlContent) {
      template.htmlContent = htmlContent;
      // Auto-update plain text if HTML changed and textContent not provided
      if (!textContent) {
        template.textContent = htmlContent.replace(/<[^>]*>/g, '');
      }
    }
    if (textContent !== undefined) template.textContent = textContent;
    if (variables !== undefined) template.variables = variables;
    if (previewImage !== undefined) template.previewImage = previewImage;
    if (isActive !== undefined) template.isActive = isActive;

    await template.save();

    const updatedTemplate = await EmailTemplate.findById(template._id)
      .populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      data: updatedTemplate
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete template
// @route   DELETE /api/email-templates/:id
// @access  Private
exports.deleteTemplate = async (req, res) => {
  try {
    const template = await EmailTemplate.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    if (!canModifyTemplate(req, template)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this template'
      });
    }

    await template.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Preview template with sample data
// @route   POST /api/email-templates/:id/preview
// @access  Private
exports.previewTemplate = async (req, res) => {
  try {
    const template = await EmailTemplate.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Sample data for preview
    const sampleData = {
      name: req.body.name || 'John Doe',
      email: req.body.email || 'john.doe@example.com',
      course: req.body.course || 'Cloud & DevOps',
      country: req.body.country || 'United States',
      company: req.body.company || 'Acme Corp',
      student_name: req.body.student_name || 'John Doe',
      course_name: req.body.course_name || 'Cloud & DevOps',
      course_duration: req.body.course_duration || '12 weeks',
      course_mode: req.body.course_mode || 'Online Live',
      course_level: req.body.course_level || 'Beginner to Intermediate',
      course_outcome: req.body.course_outcome || 'Hands-on projects and certification readiness',
      start_date: req.body.start_date || '05 Feb 2026',
      batch_timings: req.body.batch_timings || 'Weekdays 7-9 PM IST',
      demo_date: req.body.demo_date || '20 Jan 2026',
      demo_time: req.body.demo_time || '6:30 PM IST',
      meeting_link: req.body.meeting_link || 'https://meet.google.com/demo',
      fee: req.body.fee || 'INR 24,999',
      discount: req.body.discount || '10%',
      discount_deadline: req.body.discount_deadline || '31 Jan 2026',
      enrollment_link: req.body.enrollment_link || 'https://traincape.com/enroll',
      counselor_name: req.body.counselor_name || 'Traincape Team',
      support_email: req.body.support_email || 'support@traincapetech.com',
      support_phone: req.body.support_phone || '+91-98765-43210'
    };

    const variables = buildTemplateVariables(sampleData, {
      fromName: sampleData.counselor_name,
      supportEmail: sampleData.support_email,
      supportPhone: sampleData.support_phone,
      course_duration: sampleData.course_duration,
      course_mode: sampleData.course_mode,
      course_level: sampleData.course_level,
      course_outcome: sampleData.course_outcome,
      start_date: sampleData.start_date,
      batch_timings: sampleData.batch_timings,
      demo_date: sampleData.demo_date,
      demo_time: sampleData.demo_time,
      meeting_link: sampleData.meeting_link,
      fee: sampleData.fee,
      discount: sampleData.discount,
      discount_deadline: sampleData.discount_deadline,
      enrollment_link: sampleData.enrollment_link
    });

    // Replace variables in HTML content
    const previewHtml = replaceTemplateVariables(template.htmlContent, variables);
    const previewSubject = replaceTemplateVariables(template.subject, variables);

    res.status(200).json({
      success: true,
      data: {
        subject: previewSubject,
        htmlContent: previewHtml,
        textContent: template.textContent ? replaceTemplateVariables(template.textContent, variables) : null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Duplicate template
// @route   POST /api/email-templates/:id/duplicate
// @access  Private
exports.duplicateTemplate = async (req, res) => {
  try {
    const originalTemplate = await EmailTemplate.findById(req.params.id);

    if (!originalTemplate) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    const { name } = req.body;
    const newName = name || `${originalTemplate.name} (Copy)`;

    // Check if new name already exists
    const existingTemplate = await EmailTemplate.findOne({ name: newName });
    if (existingTemplate) {
      return res.status(400).json({
        success: false,
        message: 'Template name already exists'
      });
    }

    const duplicatedTemplate = await EmailTemplate.create({
      name: newName,
      category: originalTemplate.category,
      subject: originalTemplate.subject,
      htmlContent: originalTemplate.htmlContent,
      textContent: originalTemplate.textContent,
      variables: originalTemplate.variables,
      previewImage: originalTemplate.previewImage,
      createdBy: req.user.id,
      isActive: true,
      usageCount: 0
    });

    const populatedTemplate = await EmailTemplate.findById(duplicatedTemplate._id)
      .populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      data: populatedTemplate
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

