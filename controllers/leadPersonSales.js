const LeadPersonSale = require('../models/LeadPersonSale');

// @desc    Get all lead person sales
// @route   GET /api/lead-person-sales
// @access  Private (Lead Person, Manager, Admin)
exports.getLeadPersonSales = async (req, res) => {
  try {
    let query;

    // Copy req.query
    const reqQuery = { ...req.query };

    // Fields to exclude
    const removeFields = ['select', 'sort', 'page', 'limit'];

    // Loop over removeFields and delete them from reqQuery
    removeFields.forEach(param => delete reqQuery[param]);

    // Create query string
    let queryStr = JSON.stringify(reqQuery);

    // Create operators ($gt, $gte, etc)
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);

    // If user is a lead person, only show their sales
    if (req.user.role === 'Lead Person') {
      query = LeadPersonSale.find({ leadPerson: req.user.id, ...JSON.parse(queryStr) });
    } 
    // Admin and Manager can see all lead person sales
    else if (['Admin', 'Manager'].includes(req.user.role)) {
      query = LeadPersonSale.find(JSON.parse(queryStr));
    } else {
      // Other roles cannot access these sales
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access lead person sales'
      });
    }

    // Select Fields
    if (req.query.select) {
      const fields = req.query.select.split(',').join(' ');
      query = query.select(fields);
    }

    // Sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-date');
    }

    // Populate
    query = query.populate('salesPerson leadPerson', 'fullName email');

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await LeadPersonSale.countDocuments();

    query = query.skip(startIndex).limit(limit);

    // Executing query
    const sales = await query;

    // Pagination result
    const pagination = {};

    if (endIndex < total) {
      pagination.next = {
        page: page + 1,
        limit
      };
    }

    if (startIndex > 0) {
      pagination.prev = {
        page: page - 1,
        limit
      };
    }

    res.status(200).json({
      success: true,
      count: sales.length,
      pagination,
      data: sales
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single lead person sale
// @route   GET /api/lead-person-sales/:id
// @access  Private (Lead Person, Manager, Admin)
exports.getLeadPersonSale = async (req, res) => {
  try {
    const sale = await LeadPersonSale.findById(req.params.id)
      .populate({
        path: 'salesPerson leadPerson',
        select: 'fullName email'
      });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: `No lead person sale found with id of ${req.params.id}`
      });
    }

    // Make sure user can access this sale
    if (req.user.role === 'Lead Person' && sale.leadPerson._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: `User ${req.user.id} is not authorized to access this sale`
      });
    }

    res.status(200).json({
      success: true,
      data: sale
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new lead person sale
// @route   POST /api/lead-person-sales
// @access  Private (Lead Person, Manager, Admin)
exports.createLeadPersonSale = async (req, res) => {
  try {
    // Add user to req.body as creator
    req.body.createdBy = req.user.id;
    
    console.log('Create lead person sale request from user:', {
      id: req.user.id,
      role: req.user.role,
      body: req.body
    });

    // If user is lead person, set them as the lead person
    if (req.user.role === 'Lead Person') {
      req.body.leadPerson = req.user.id;
    }
    
    // Make sure leadPerson is set
    if (!req.body.leadPerson) {
      return res.status(400).json({
        success: false,
        message: 'Lead person is required'
      });
    }
    
    // Make sure salesPerson is set
    if (!req.body.salesPerson) {
      return res.status(400).json({
        success: false,
        message: 'Sales person is required'
      });
    }
    
    console.log('Creating lead person sale with data:', req.body);

    // Create lead person sale
    const sale = await LeadPersonSale.create(req.body);
    
    console.log('Lead person sale created successfully:', sale._id);

    res.status(201).json({
      success: true,
      data: sale
    });
  } catch (err) {
    console.error('Error creating lead person sale:', err);
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Update lead person sale
// @route   PUT /api/lead-person-sales/:id
// @access  Private (Lead Person, Manager, Admin)
exports.updateLeadPersonSale = async (req, res) => {
  try {
    let sale = await LeadPersonSale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: `No lead person sale found with id of ${req.params.id}`
      });
    }

    // Make sure user is authorized to update this sale
    if (req.user.role === 'Lead Person' && sale.leadPerson.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: `User ${req.user.id} is not authorized to update this sale`
      });
    }

    // Add user to req.body as updater
    req.body.updatedBy = req.user.id;

    // Update sale
    sale = await LeadPersonSale.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: sale
    });
  } catch (err) {
    console.error(err);
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Delete lead person sale
// @route   DELETE /api/lead-person-sales/:id
// @access  Private (Lead Person, Manager, Admin)
exports.deleteLeadPersonSale = async (req, res) => {
  try {
    const sale = await LeadPersonSale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: `No lead person sale found with id of ${req.params.id}`
      });
    }

    // Make sure user is authorized to delete this sale
    if (req.user.role === 'Lead Person' && sale.leadPerson.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: `User ${req.user.id} is not authorized to delete this sale`
      });
    }

    await LeadPersonSale.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
}; 