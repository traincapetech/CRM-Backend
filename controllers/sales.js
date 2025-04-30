const Sale = require('../models/Sale');
const Lead = require('../models/Lead');

// @desc    Get all sales
// @route   GET /api/sales
// @access  Private
exports.getSales = async (req, res) => {
  try {
    console.log('============= GET SALES REQUEST =============');
    console.log('User making request:', {
      id: req.user._id,
      role: req.user.role,
      name: req.user.fullName,
      email: req.user.email
    });
    
    // Add query parameters for filtering if needed
    const filter = {};
    
    // If not admin or manager, only show sales assigned to the user
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      filter.salesPerson = req.user._id;
    }
    
    const sales = await Sale.find(filter)
      .populate({
        path: 'leadId',
        select: 'name email company phone countryCode country leadPerson assignedTo createdBy',
        populate: [
          { path: 'leadPerson', select: 'fullName email' },
          { path: 'assignedTo', select: 'fullName email' },
          { path: 'createdBy', select: 'fullName email' }
        ]
      })
      .populate('salesPerson', 'fullName email')
      .sort({ createdAt: -1 });
    
    // Log some details about the results
    console.log(`Found ${sales.length} sales records`);
    
    // Check for potentially problematic records
    const problematicSales = sales.filter(sale => 
      !sale.leadId || !sale.leadId.name || !sale.leadId.phone || !sale.leadId.country
    );
    
    if (problematicSales.length > 0) {
      console.warn(`Found ${problematicSales.length} sales with incomplete lead data:`);
      problematicSales.forEach(sale => {
        console.warn(`  - Sale ID: ${sale._id}, Product: ${sale.product}, leadId: ${sale.leadId ? sale.leadId._id : 'missing'}`);
      });
    }
    
    console.log('==============================================');
    
    res.status(200).json({
      success: true,
      count: sales.length,
      data: sales
    });
  } catch (err) {
    console.error('Error fetching sales:', err);
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
      .populate({
        path: 'leadId',
        select: 'name email company phone countryCode country leadPerson assignedTo createdBy',
        populate: [
          { path: 'leadPerson', select: 'fullName email' },
          { path: 'assignedTo', select: 'fullName email' },
          { path: 'createdBy', select: 'fullName email' }
        ]
      })
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
    console.log('============= CREATE SALE REQUEST =============');
    console.log('Sale data submitted:', req.body);
    console.log('User creating sale:', {
      id: req.user._id,
      role: req.user.role,
      name: req.user.fullName,
      email: req.user.email
    });
    
    // Add user to req.body as salesPerson
    req.body.salesPerson = req.user._id;
    
    // Check if lead exists
    const lead = await Lead.findById(req.body.leadId)
      .populate('leadPerson', 'fullName email')
      .populate('createdBy', 'fullName email')
      .populate('assignedTo', 'fullName email');
    
    if (!lead) {
      console.log(`No lead found with id: ${req.body.leadId}`);
      return res.status(404).json({
        success: false,
        message: `No lead found with id of ${req.body.leadId}`
      });
    }
    
    console.log('Found lead:', {
      id: lead._id,
      name: lead.name,
      phone: lead.phone,
      countryCode: lead.countryCode,
      country: lead.country,
      leadPerson: lead.leadPerson ? {
        id: lead.leadPerson._id,
        name: lead.leadPerson.fullName
      } : 'None',
      createdBy: lead.createdBy ? {
        id: lead.createdBy._id,
        name: lead.createdBy.fullName
      } : 'None',
      assignedTo: lead.assignedTo ? {
        id: lead.assignedTo._id,
        name: lead.assignedTo.fullName
      } : 'None'
    });
    
    // Update lead status to Converted if sale is closed
    if (req.body.status === 'Closed') {
      lead.status = 'Converted';
      await lead.save();
    }
    
    const sale = await Sale.create(req.body);
    console.log('Created new sale with ID:', sale._id);
    
    // Return populated sale data
    const populatedSale = await Sale.findById(sale._id)
      .populate({
        path: 'leadId',
        select: 'name email company phone countryCode country leadPerson assignedTo createdBy',
        populate: [
          { path: 'leadPerson', select: 'fullName email' },
          { path: 'assignedTo', select: 'fullName email' },
          { path: 'createdBy', select: 'fullName email' }
        ]
      })
      .populate('salesPerson', 'fullName email');
    
    console.log('Populated sale data:', {
      id: populatedSale._id,
      leadId: populatedSale.leadId ? populatedSale.leadId._id : 'None',
      leadName: populatedSale.leadId ? populatedSale.leadId.name : 'None',
      product: populatedSale.product,
      salesPerson: populatedSale.salesPerson ? populatedSale.salesPerson.fullName : 'None'
    });
    
    console.log('==============================================');
    
    res.status(201).json({
      success: true,
      data: populatedSale
    });
  } catch (err) {
    console.error("Error creating sale:", err);
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
    
    // Return populated sale data
    const populatedSale = await Sale.findById(sale._id)
      .populate({
        path: 'leadId',
        select: 'name email company phone countryCode country leadPerson assignedTo createdBy',
        populate: [
          { path: 'leadPerson', select: 'fullName email' },
          { path: 'assignedTo', select: 'fullName email' },
          { path: 'createdBy', select: 'fullName email' }
        ]
      })
      .populate('salesPerson', 'fullName email');
    
    res.status(200).json({
      success: true,
      data: populatedSale
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
    
    // Return populated sale data
    const populatedSale = await Sale.findById(sale._id)
      .populate({
        path: 'leadId',
        select: 'name email company phone countryCode country leadPerson assignedTo createdBy',
        populate: [
          { path: 'leadPerson', select: 'fullName email' },
          { path: 'assignedTo', select: 'fullName email' },
          { path: 'createdBy', select: 'fullName email' }
        ]
      })
      .populate('salesPerson', 'fullName email');
    
    res.status(200).json({
      success: true,
      data: populatedSale
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
    
    // Return populated sale data
    const populatedSale = await Sale.findById(sale._id)
      .populate({
        path: 'leadId',
        select: 'name email company phone countryCode country leadPerson assignedTo createdBy',
        populate: [
          { path: 'leadPerson', select: 'fullName email' },
          { path: 'assignedTo', select: 'fullName email' },
          { path: 'createdBy', select: 'fullName email' }
        ]
      })
      .populate('salesPerson', 'fullName email');
    
    res.status(200).json({
      success: true,
      data: populatedSale
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
}; 