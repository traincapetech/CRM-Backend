const Prospect = require('../models/Prospect');
const Lead = require('../models/Lead');

// Get all prospects with filtering and pagination
const getProspects = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      source,
      priority,
      assignedTo,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (priority) filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;
    
    // Search functionality
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } }
      ];
    }

    // Role-based filtering
    if (req.user.role === 'Sales Person') {
      filter.assignedTo = req.user._id;
    }

    const skip = (page - 1) * limit;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const prospects = await Prospect.find(filter)
      .populate('assignedTo', 'fullName email')
      .populate('createdBy', 'fullName email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Prospect.countDocuments(filter);

    res.json({
      success: true,
      data: prospects,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get prospects error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching prospects',
      error: error.message
    });
  }
};

// Get single prospect by ID
const getProspectById = async (req, res) => {
  try {
    const prospect = await Prospect.findById(req.params.id)
      .populate('assignedTo', 'fullName email role')
      .populate('createdBy', 'fullName email role')
      .populate('leadId', 'name status');

    if (!prospect) {
      return res.status(404).json({
        success: false,
        message: 'Prospect not found'
      });
    }

    // Role-based access check
    if (req.user.role === 'Sales Person' && 
        prospect.assignedTo && 
        prospect.assignedTo._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: prospect
    });
  } catch (error) {
    console.error('Get prospect error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching prospect',
      error: error.message
    });
  }
};

// Create new prospect
const createProspect = async (req, res) => {
  try {
    const prospectData = {
      ...req.body,
      createdBy: req.user._id
    };

    // If no assignedTo specified and user is Sales Person, assign to self
    if (!prospectData.assignedTo && req.user.role === 'Sales Person') {
      prospectData.assignedTo = req.user._id;
    }

    const prospect = new Prospect(prospectData);
    await prospect.save();

    const populatedProspect = await Prospect.findById(prospect._id)
      .populate('assignedTo', 'fullName email')
      .populate('createdBy', 'fullName email');

    res.status(201).json({
      success: true,
      message: 'Prospect created successfully',
      data: populatedProspect
    });
  } catch (error) {
    console.error('Create prospect error:', error);
    res.status(400).json({
      success: false,
      message: 'Error creating prospect',
      error: error.message
    });
  }
};

// Update prospect
const updateProspect = async (req, res) => {
  try {
    const prospect = await Prospect.findById(req.params.id);

    if (!prospect) {
      return res.status(404).json({
        success: false,
        message: 'Prospect not found'
      });
    }

    // Role-based access check
    if (req.user.role === 'Sales Person' && 
        prospect.assignedTo && 
        prospect.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const updatedProspect = await Prospect.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('assignedTo', 'fullName email')
     .populate('createdBy', 'fullName email');

    res.json({
      success: true,
      message: 'Prospect updated successfully',
      data: updatedProspect
    });
  } catch (error) {
    console.error('Update prospect error:', error);
    res.status(400).json({
      success: false,
      message: 'Error updating prospect',
      error: error.message
    });
  }
};

// Delete prospect
const deleteProspect = async (req, res) => {
  try {
    const prospect = await Prospect.findById(req.params.id);

    if (!prospect) {
      return res.status(404).json({
        success: false,
        message: 'Prospect not found'
      });
    }

    // Only Admin and Manager can delete prospects
    if (!['Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Admin and Manager can delete prospects.'
      });
    }

    await Prospect.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Prospect deleted successfully'
    });
  } catch (error) {
    console.error('Delete prospect error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting prospect',
      error: error.message
    });
  }
};

// Convert prospect to lead
const convertToLead = async (req, res) => {
  try {
    const prospect = await Prospect.findById(req.params.id);

    if (!prospect) {
      return res.status(404).json({
        success: false,
        message: 'Prospect not found'
      });
    }

    if (prospect.convertedToLead) {
      return res.status(400).json({
        success: false,
        message: 'Prospect already converted to lead'
      });
    }

    // Role-based access check
    if (req.user.role === 'Sales Person' && 
        prospect.assignedTo && 
        prospect.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Create lead from prospect data
    const leadData = prospect.convertToLead();
    const lead = new Lead(leadData);
    await lead.save();

    // Update prospect to mark as converted
    prospect.convertedToLead = true;
    prospect.leadId = lead._id;
    prospect.conversionDate = new Date();
    prospect.status = 'Converted to Lead';
    await prospect.save();

    const populatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'fullName email')
      .populate('createdBy', 'fullName email');

    res.json({
      success: true,
      message: 'Prospect converted to lead successfully',
      data: {
        prospect: prospect,
        lead: populatedLead
      }
    });
  } catch (error) {
    console.error('Convert prospect error:', error);
    res.status(500).json({
      success: false,
      message: 'Error converting prospect to lead',
      error: error.message
    });
  }
};

// Get prospect statistics
const getProspectStats = async (req, res) => {
  try {
    const filter = {};
    
    // Role-based filtering
    if (req.user.role === 'Sales Person') {
      filter.assignedTo = req.user._id;
    }

    const stats = await Prospect.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          new: { $sum: { $cond: [{ $eq: ['$status', 'New'] }, 1, 0] } },
          contacted: { $sum: { $cond: [{ $eq: ['$status', 'Contacted'] }, 1, 0] } },
          interested: { $sum: { $cond: [{ $eq: ['$status', 'Interested'] }, 1, 0] } },
          qualified: { $sum: { $cond: [{ $eq: ['$status', 'Qualified'] }, 1, 0] } },
          converted: { $sum: { $cond: [{ $eq: ['$status', 'Converted to Lead'] }, 1, 0] } },
          lost: { $sum: { $cond: [{ $eq: ['$status', 'Lost'] }, 1, 0] } }
        }
      }
    ]);

    const sourceStats = await Prospect.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: stats[0] || {
          total: 0, new: 0, contacted: 0, interested: 0, 
          qualified: 0, converted: 0, lost: 0
        },
        sources: sourceStats
      }
    });
  } catch (error) {
    console.error('Get prospect stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching prospect statistics',
      error: error.message
    });
  }
};

module.exports = {
  getProspects,
  getProspectById,
  createProspect,
  updateProspect,
  deleteProspect,
  convertToLead,
  getProspectStats
}; 