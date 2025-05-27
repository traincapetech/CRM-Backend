const Sale = require('../models/Sale');
const User = require('../models/User');

// @desc    Get all sales
// @route   GET /api/sales
// @access  Private
exports.getSales = async (req, res) => {
  try {
    let query;

    console.log('=== SALES API REQUEST DEBUG ===');
    console.log('Original req.query:', req.query);
    console.log('User role:', req.user.role);
    console.log('User ID:', req.user.id);

    // Copy req.query
    const reqQuery = { ...req.query };

    // Fields to exclude
    const removeFields = ['select', 'sort', 'page', 'limit', 'full', 'nocache'];

    // Loop over removeFields and delete them from reqQuery
    removeFields.forEach(param => delete reqQuery[param]);

    console.log('reqQuery after removing fields:', reqQuery);

    // Create query string
    let queryStr = JSON.stringify(reqQuery);
    console.log('Query string:', queryStr);

    // Create operators ($gt, $gte, etc)
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);

    // If user is a sales person, only show their sales
    if (req.user.role === 'Sales Person') {
      query = Sale.find({ 
        salesPerson: req.user.id, 
        ...JSON.parse(queryStr) 
      });
    } 
    // If user is a lead person, only show sales with them as lead
    else if (req.user.role === 'Lead Person') {
      query = Sale.find({ leadPerson: req.user.id, ...JSON.parse(queryStr) });
    }
    // Admin and Manager can see all
    else {
      query = Sale.find(JSON.parse(queryStr));
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
    
    // Count documents with the same filter as the query
    let countQuery = {};
    if (req.user.role === 'Sales Person') {
      countQuery = { 
        salesPerson: req.user.id, 
        ...JSON.parse(queryStr) 
      };
    } else if (req.user.role === 'Lead Person') {
      countQuery = { leadPerson: req.user.id, ...JSON.parse(queryStr) };
    } else {
      countQuery = JSON.parse(queryStr);
    }
    
    const total = await Sale.countDocuments(countQuery);

    // If full=true is in the query params, skip pagination and return all records
    if (req.query.full === 'true') {
      console.log('Returning all sales without pagination');
      console.log('User role:', req.user.role);
      console.log('User ID:', req.user.id);
      console.log('Query string:', queryStr);
      console.log('Parsed query:', JSON.parse(queryStr));
      
      const allSales = await query;
      console.log('Found sales count:', allSales.length);
      
      return res.status(200).json({
        success: true,
        count: allSales.length,
        data: allSales
      });
    }

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

// @desc    Get single sale
// @route   GET /api/sales/:id
// @access  Private
exports.getSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate({
        path: 'salesPerson leadPerson',
        select: 'fullName email'
      });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: `No sale found with id of ${req.params.id}`
      });
    }

    // Make sure user can access this sale
    if (
      req.user.role === 'Sales Person' && 
      sale.salesPerson._id.toString() !== req.user.id &&
      req.user.role === 'Lead Person' && 
      sale.leadPerson._id.toString() !== req.user.id
    ) {
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

// @desc    Create new sale
// @route   POST /api/sales
// @access  Private
exports.createSale = async (req, res) => {
  try {
    // Add user to req.body as creator
    req.body.createdBy = req.user.id;
    
    console.log('Create sale request from user:', {
      id: req.user.id,
      role: req.user.role,
      body: req.body
    });

    // Add more detailed logging for currency field
    console.log('Currency data in request:', {
      currency: req.body.currency,
      totalCost: req.body.totalCost,
      tokenAmount: req.body.tokenAmount
    });

    // If user is sales person, set them as the sales person
    if (req.user.role === 'Sales Person') {
      req.body.salesPerson = req.user.id;
    }
    
    // If user is lead person, set them as the lead person
    if (req.user.role === 'Lead Person') {
      req.body.leadPerson = req.user.id;
      req.body.isLeadPersonSale = true; // Mark as lead person sale
    }
    
    // Allow creating sale from reference (not in leads)
    // For Sales Persons, allow creating sales with a reference source
    if (req.user.role === 'Sales Person' && req.body.source === 'Reference' && !req.body.leadPerson) {
      console.log('Creating sale from reference by sales person');
      
      // Find an admin or manager to set as the lead person
      const leadPerson = await User.findOne({ role: { $in: ['Admin', 'Manager'] } });
      
      if (!leadPerson) {
        return res.status(400).json({
          success: false,
          message: 'No admin or manager found to set as lead person for reference sale'
        });
      }
      
      console.log(`Setting default lead person to ${leadPerson.fullName} (${leadPerson._id})`);
      req.body.leadPerson = leadPerson._id;
      req.body.isReference = true; // Mark as reference sale
    }
    
    // Make sure leadPerson is set regardless of what's in the request body
    if (!req.body.leadPerson) {
      return res.status(400).json({
        success: false,
        message: 'Lead person is required. Please provide a lead person ID or select "Reference" as the source.'
      });
    }
    
    console.log('Creating sale with data:', req.body);

    // Create sale
    const sale = await Sale.create(req.body);
    
    console.log('Sale created successfully:', sale._id);

    res.status(201).json({
      success: true,
      data: sale
    });
  } catch (err) {
    console.error('Error creating sale:', err);
    
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

// @desc    Update sale
// @route   PUT /api/sales/:id
// @access  Private
exports.updateSale = async (req, res) => {
  try {
    let sale = await Sale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: `No sale found with id of ${req.params.id}`
      });
    }

    // Make sure user is authorized to update this sale
    if (
      req.user.role === 'Sales Person' && 
      sale.salesPerson.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: `User ${req.user.id} is not authorized to update this sale`
      });
    }
    
    // For Sales Persons, only allow updating the status
    if (req.user.role === 'Sales Person') {
      console.log('Sales Person updating sale:', req.body);
      
      // Allow Sales Persons to update all fields of their own sales
      // Add user to req.body as updater
      req.body.updatedBy = req.user.id;
      
      // Update sale with all fields
      sale = await Sale.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true
      });
      
      return res.status(200).json({
        success: true,
        data: sale
      });
    }

    // Add user to req.body as updater for other roles
    req.body.updatedBy = req.user.id;

    // Update sale (full update for non-Sales Person roles)
    sale = await Sale.findByIdAndUpdate(req.params.id, req.body, {
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

// @desc    Delete sale
// @route   DELETE /api/sales/:id
// @access  Private
exports.deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: `No sale found with id of ${req.params.id}`
      });
    }

    // Make sure user is authorized to delete this sale
    // Sales Person can only delete their own sales
    if (req.user.role === 'Sales Person' && sale.salesPerson.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: `User ${req.user.id} is not authorized to delete this sale`
      });
    }
    
    // Lead Person cannot delete sales
    if (req.user.role === 'Lead Person') {
      return res.status(403).json({
        success: false,
        message: `User with role ${req.user.role} is not authorized to delete sales`
      });
    }

    // Use findByIdAndDelete instead of remove (which is deprecated)
    await Sale.findByIdAndDelete(req.params.id);

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

// @desc    Update token amount
// @route   PUT /api/sales/:id/token
// @access  Private
exports.updateToken = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (token === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide token amount'
      });
    }

    let sale = await Sale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: `No sale found with id of ${req.params.id}`
      });
    }

    // Sales Person can only update their own sales
    if (
      req.user.role === 'Sales Person' && 
      sale.salesPerson.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: `User ${req.user.id} is not authorized to update this sale`
      });
    }

    // Update the token amount and the updatedBy field
    sale = await Sale.findByIdAndUpdate(
      req.params.id, 
      { 
        tokenAmount: token,
        updatedBy: req.user.id
      }, 
      {
        new: true,
        runValidators: true
      }
    );

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

// @desc    Update pending status
// @route   PUT /api/sales/:id/pending
// @access  Private
exports.updatePending = async (req, res) => {
  try {
    const { pending } = req.body;
    
    if (pending === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide pending status'
      });
    }

    let sale = await Sale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: `No sale found with id of ${req.params.id}`
      });
    }

    // Update the pending status and the updatedBy field
    sale = await Sale.findByIdAndUpdate(
      req.params.id, 
      { 
        pending,
        status: pending ? 'Pending' : 'Completed',
        updatedBy: req.user.id
      }, 
      {
        new: true,
        runValidators: true
      }
    );

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

// @desc    Import sales data
// @route   POST /api/sales/import
// @access  Private (Admin only)
exports.importSales = async (req, res) => {
  try {
    if (!req.body || !req.body.sales || !Array.isArray(req.body.sales)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide sales data in the correct format'
      });
    }

    const { sales } = req.body;
    
    // Add user ID to each sale
    const salesWithUser = sales.map(sale => ({
      ...sale,
      createdBy: req.user.id,
      updatedBy: req.user.id
    }));
    
    // Insert sales
    const result = await Sale.insertMany(salesWithUser, { 
      ordered: false,
      rawResult: true
    });
    
    res.status(201).json({
      success: true,
      message: `Successfully imported ${result.insertedCount} sales`,
      data: {
        insertedCount: result.insertedCount,
        errors: result.writeErrors ? result.writeErrors.length : 0
      }
    });
  } catch (err) {
    console.error('Error importing sales data:', err);
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate entries found. Please check your data.'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server Error while importing sales data'
    });
  }
};

// @desc    Get sales count
// @route   GET /api/sales/count
// @access  Private
exports.getSalesCount = async (req, res) => {
  try {
    let count;
    
    // If user is a sales person, only count their sales
    if (req.user.role === 'Sales Person') {
      count = await Sale.countDocuments({ 
        salesPerson: req.user.id, 
        isLeadPersonSale: { $ne: true } // Exclude lead person sales
      });
    } 
    // If user is a lead person, only count sales with them as lead
    else if (req.user.role === 'Lead Person') {
      count = await Sale.countDocuments({ leadPerson: req.user.id });
    }
    // Admin and Manager can see all
    else {
      count = await Sale.countDocuments();
    }
    
    console.log(`Returning sales count: ${count}`);
    
    res.status(200).json({
      success: true,
      count
    });
  } catch (err) {
    console.error('Error getting sales count:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
}; 