const Lead = require('../models/Lead');

// @desc    Get all leads
// @route   GET /api/leads
// @access  Private
exports.getLeads = async (req, res) => {
  try {
    console.log('============= GET LEADS REQUEST =============');
    console.log('User making request:', {
      id: req.user._id,
      idString: req.user._id.toString(),
      role: req.user.role,
      name: req.user.fullName,
      email: req.user.email
    });
    
    // Instead of using complex filtering, let's use direct MongoDB queries
    let leads = [];
    
    // Different queries based on role
    if (req.user.role === 'Admin' || req.user.role === 'Manager') {
      // Admin and Manager see all leads
      console.log('Admin/Manager role - fetching ALL leads');
      leads = await Lead.find({})
        .populate('assignedTo', 'fullName email role')
        .populate('leadPerson', 'fullName email role');
    } 
    else if (req.user.role === 'Lead Person') {
      // Lead Person sees leads they created or leads assigned to them
      console.log('Lead Person role - fetching created or assigned leads');
      const userId = req.user._id;
      
      // Query with direct ID comparison
      leads = await Lead.find({
        $or: [
          { leadPerson: userId },
          { assignedTo: userId }
        ]
      })
      .populate('assignedTo', 'fullName email role')
      .populate('leadPerson', 'fullName email role');
    }
    else {
      // Sales Person sees only leads assigned to them
      console.log('Sales Person role - fetching assigned leads');
      const userId = req.user._id;
      
      // Query for assignedTo exact match
      leads = await Lead.find({ assignedTo: userId })
        .populate('assignedTo', 'fullName email role')
        .populate('leadPerson', 'fullName email role');
    }
    
    console.log(`Found ${leads.length} leads for this user`);
    
    // Log lead details for debugging
    if (leads.length > 0) {
      console.log('Lead details:');
      leads.forEach(lead => {
        console.log(`- Lead ID: ${lead._id}, Name: ${lead.name}`);
        console.log(`  Assigned to: ${lead.assignedTo ? lead.assignedTo.fullName + ' (ID: ' + lead.assignedTo._id + ')' : 'None'}`);
      });
    } else {
      // If no leads were found, check ALL leads in the database to see why
      console.log('No leads found for this user. Checking all leads:');
      const allLeads = await Lead.find({}).populate('assignedTo', 'fullName email role');
      
      console.log(`Total leads in database: ${allLeads.length}`);
      allLeads.forEach(lead => {
        const assignedUserId = lead.assignedTo ? lead.assignedTo._id.toString() : 'None';
        const currentUserId = req.user._id.toString();
        const isMatch = assignedUserId === currentUserId;
        
        console.log(`- Lead "${lead.name}" is assigned to: ${lead.assignedTo ? lead.assignedTo.fullName : 'None'} (ID: ${assignedUserId})`);
        console.log(`  Current user ID: ${currentUserId}, Match: ${isMatch}`);
      });
    }
    
    console.log('==============================================');
    
    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads
    });
  } catch (err) {
    console.error('Error in getLeads:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Get single lead
// @route   GET /api/leads/:id
// @access  Private
exports.getLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedTo', 'fullName email')
      .populate('leadPerson', 'fullName email');
    
    console.log('Lead found:', lead ? lead._id : 'None');
    
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: `No lead found with id of ${req.params.id}`
      });
    }
    
    // Show detailed info for debugging
    console.log('Lead details:');
    console.log(`  - ID: ${lead._id}`);
    console.log(`  - Name: ${lead.name}`); 
    console.log(`  - AssignedTo ID: ${lead.assignedTo ? lead.assignedTo._id : 'None'}`);
    console.log(`  - AssignedTo Name: ${lead.assignedTo ? lead.assignedTo.fullName : 'None'}`);
    console.log(`  - Current User ID: ${req.user._id}`);
    
    const leadAssignedId = lead.assignedTo ? lead.assignedTo._id.toString() : null;
    const userId = req.user._id.toString();
    console.log(`  - String comparison: ${leadAssignedId === userId}`);
    
    // Check if user is authorized to view this lead
    if (
      req.user.role !== 'Admin' && 
      req.user.role !== 'Manager' && 
      lead.assignedTo.toString() !== req.user._id.toString() &&
      !(req.user.role === 'Lead Person' && 
        lead.leadPerson && 
        lead.leadPerson._id.toString() === req.user._id.toString())
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this lead'
      });
    }
    
    res.status(200).json({
      success: true,
      data: lead
    });
  } catch (err) {
    console.error('Error in getLead:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Create new lead
// @route   POST /api/leads
// @access  Private
exports.createLead = async (req, res) => {
  try {
    console.log('============= CREATE LEAD REQUEST =============');
    console.log('Lead data submitted:', req.body);
    console.log('User creating lead:', {
      id: req.user._id,
      role: req.user.role,
      name: req.user.fullName
    });
    
    const leadData = { ...req.body };
    
    // If the user is a Lead Person, set them as the leadPerson
    if (req.user.role === 'Lead Person') {
      leadData.leadPerson = req.user._id;
      console.log('Setting leadPerson to current user', req.user._id);
    }
    
    // Critical: Make sure assignedTo is properly set
    if (!leadData.assignedTo || leadData.assignedTo === '') {
      console.log('No assignedTo provided, using current user', req.user._id);
      leadData.assignedTo = req.user._id;
    } else {
      console.log('Using provided assignedTo:', leadData.assignedTo);
      // ObjectId is handled properly by Mongoose, no need to convert
    }
    
    // Make sure creation timestamp is set
    leadData.createdAt = Date.now();
    leadData.updatedAt = Date.now();
    
    console.log('Final lead data before creation:', leadData);
    
    const lead = await Lead.create(leadData);
    
    // Verify the created lead
    const createdLead = await Lead.findById(lead._id).populate('assignedTo');
    console.log('Created lead successfully:', {
      id: createdLead._id,
      name: createdLead.name,
      assignedTo: createdLead.assignedTo ? {
        id: createdLead.assignedTo._id,
        name: createdLead.assignedTo.fullName
      } : 'None'
    });
    console.log('==============================================');
    
    res.status(201).json({
      success: true,
      data: lead
    });
  } catch (err) {
    console.error('Error creating lead:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Update lead
// @route   PUT /api/leads/:id
// @access  Private
exports.updateLead = async (req, res) => {
  try {
    let lead = await Lead.findById(req.params.id);
    
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: `No lead found with id of ${req.params.id}`
      });
    }
    
    // Check if user is authorized to update this lead
    if (
      req.user.role !== 'Admin' && 
      req.user.role !== 'Manager' && 
      lead.assignedTo.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this lead'
      });
    }
    
    // Update the updatedAt field
    req.body.updatedAt = Date.now();
    
    lead = await Lead.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    
    res.status(200).json({
      success: true,
      data: lead
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Delete lead
// @route   DELETE /api/leads/:id
// @access  Private
exports.deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: `No lead found with id of ${req.params.id}`
      });
    }
    
    // Check if user is authorized to delete this lead
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete leads'
      });
    }
    
    await lead.deleteOne();
    
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Get leads assigned to sales person
// @route   GET /api/leads/assigned
// @access  Private (Sales Person only)
exports.getAssignedLeads = async (req, res) => {
  try {
    // Verify the user is a Sales Person
    if (req.user.role !== 'Sales Person') {
      return res.status(403).json({
        success: false,
        message: 'Only Sales Persons can access their assigned leads'
      });
    }

    const leads = await Lead.find({ 
      assignedTo: req.user._id 
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads
    });
  } catch (err) {
    console.error('Error fetching assigned leads:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Update lead feedback
// @route   PUT /api/leads/:id/feedback
// @access  Private (Sales Person, Lead Person, Manager, Admin)
exports.updateFeedback = async (req, res) => {
  try {
    const { feedback } = req.body;
    
    if (!feedback) {
      return res.status(400).json({
        success: false,
        message: 'Feedback field is required'
      });
    }
    
    let lead = await Lead.findById(req.params.id);
    
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: `No lead found with id of ${req.params.id}`
      });
    }
    
    // Check if user is authorized to update feedback for this lead
    if (
      req.user.role !== 'Admin' && 
      req.user.role !== 'Manager' && 
      lead.assignedTo.toString() !== req.user._id.toString() &&
      !(req.user.role === 'Lead Person' && 
        lead.leadPerson && 
        lead.leadPerson.toString() === req.user._id.toString())
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update feedback for this lead'
      });
    }
    
    // Update only the feedback field and updatedAt
    lead = await Lead.findByIdAndUpdate(
      req.params.id, 
      { 
        feedback, 
        updatedAt: Date.now() 
      }, 
      {
        new: true,
        runValidators: true
      }
    );
    
    res.status(200).json({
      success: true,
      data: lead
    });
  } catch (err) {
    console.error('Error updating feedback:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
}; 