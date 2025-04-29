const Sale = require('../models/Sale');
const Lead = require('../models/Lead');

// @desc    Get all sales
// @route   GET /api/sales
// @access  Private
exports.getSales = async (req, res) => {
  try {
    // Add query parameters for filtering if needed
    const filter = {};
    
    // If not admin or manager, only show sales assigned to the user
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      filter.salesPerson = req.user._id;
    }
    
    const sales = await Sale.find(filter)
      .populate('leadId', 'name email company')
      .populate('salesPerson', 'fullName email');
    
    res.status(200).json({
      success: true,
      count: sales.length,
      data: sales
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Get single sale
// @route   GET /api/sales/:id
// @access  Private
exports.getSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate('leadId', 'name email company')
      .populate('salesPerson', 'fullName email');
    
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: `No sale found with id of ${req.params.id}`
      });
    }
    
    // Check if user is authorized to view this sale
    if (
      req.user.role !== 'Admin' && 
      req.user.role !== 'Manager' && 
      sale.salesPerson.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this sale'
      });
    }
    
    res.status(200).json({
      success: true,
      data: sale
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Create new sale
// @route   POST /api/sales
// @access  Private
exports.createSale = async (req, res) => {
  try {
    // Add user to req.body as salesPerson
    req.body.salesPerson = req.user._id;
    
    // Check if lead exists
    const lead = await Lead.findById(req.body.leadId);
    
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: `No lead found with id of ${req.body.leadId}`
      });
    }
    
    // Update lead status to Converted if sale is closed
    if (req.body.status === 'Closed') {
      lead.status = 'Converted';
      await lead.save();
    }
    
    const sale = await Sale.create(req.body);
    
    res.status(201).json({
      success: true,
      data: sale
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
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
    
    // Check if user is authorized to update this sale
    if (
      req.user.role !== 'Admin' && 
      req.user.role !== 'Manager' && 
      sale.salesPerson.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this sale'
      });
    }
    
    // Update the updatedAt field
    req.body.updatedAt = Date.now();
    
    // If status is changing to Closed, update lead status and set closedDate
    if (req.body.status === 'Closed' && sale.status !== 'Closed') {
      const lead = await Lead.findById(sale.leadId);
      if (lead) {
        lead.status = 'Converted';
        await lead.save();
      }
      
      req.body.closedDate = Date.now();
    }
    
    sale = await Sale.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    
    res.status(200).json({
      success: true,
      data: sale
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
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
    
    // Check if user is authorized to delete this sale
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete sales'
      });
    }
    
    await sale.deleteOne();
    
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

// @desc    Update token amount
// @route   PUT /api/sales/:id/token
// @access  Private
exports.updateToken = async (req, res) => {
  try {
    let sale = await Sale.findById(req.params.id);
    
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: `No sale found with id of ${req.params.id}`
      });
    }
    
    // Check if user is authorized to update this sale
    if (
      req.user.role !== 'Admin' && 
      req.user.role !== 'Manager' && 
      sale.salesPerson.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this sale'
      });
    }
    
    // Validate token amount
    const token = parseFloat(req.body.token);
    if (isNaN(token) || token < 0) {
      return res.status(400).json({
        success: false,
        message: 'Token amount must be a valid positive number'
      });
    }
    
    // Update token and pending amounts
    sale.token = token;
    sale.pending = sale.amount - token;
    sale.updatedAt = Date.now();
    
    await sale.save();
    
    res.status(200).json({
      success: true,
      data: sale
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Update pending amount
// @route   PUT /api/sales/:id/pending
// @access  Private
exports.updatePending = async (req, res) => {
  try {
    let sale = await Sale.findById(req.params.id);
    
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: `No sale found with id of ${req.params.id}`
      });
    }
    
    // Check if user is authorized to update this sale
    if (
      req.user.role !== 'Admin' && 
      req.user.role !== 'Manager' && 
      sale.salesPerson.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this sale'
      });
    }
    
    // Validate pending amount
    const pending = parseFloat(req.body.pending);
    if (isNaN(pending) || pending < 0) {
      return res.status(400).json({
        success: false,
        message: 'Pending amount must be a valid positive number'
      });
    }
    
    // Update pending amount and token
    sale.pending = pending;
    sale.token = sale.amount - pending;
    sale.updatedAt = Date.now();
    
    await sale.save();
    
    res.status(200).json({
      success: true,
      data: sale
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
}; 