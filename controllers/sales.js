const Sale = require('../models/Sale');
const User = require('../models/User');
const { sendPaymentConfirmationEmail, sendServiceDeliveryEmail } = require('../services/emailService');

// @desc    Get all sales
// @route   GET /api/sales
// @access  Private
exports.getSales = async (req, res) => {
  try {
    let query;

    // Copy req.query
    const reqQuery = { ...req.query };

    // Fields to exclude
    const removeFields = ['select', 'sort', 'page', 'limit', 'full', 'nocache'];

    // Loop over removeFields and delete them from reqQuery
    removeFields.forEach(param => delete reqQuery[param]);

    // If full=true is requested, ignore any date filters to ensure all sales are returned
    if (req.query.full === 'true') {
      // Remove any potential date filters
      delete reqQuery.date;
      delete reqQuery.createdAt;
      delete reqQuery.updatedAt;
      // Remove any date range operators
      Object.keys(reqQuery).forEach(key => {
        if (key.includes('date') || key.includes('Date') || key.includes('created') || key.includes('updated')) {
          delete reqQuery[key];
        }
      });
    }

    // Create query string
    let queryStr = JSON.stringify(reqQuery);

    // Create operators ($gt, $gte, etc)
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);
    
    const parsedQuery = JSON.parse(queryStr);

    // If user is a sales person, only show their sales
    if (req.user.role === 'Sales Person') {
      query = Sale.find({ 
        salesPerson: req.user.id, 
        ...parsedQuery 
      });
    } 
    // If user is a lead person, only show sales with them as lead
    else if (req.user.role === 'Lead Person') {
      query = Sale.find({ leadPerson: req.user.id, ...parsedQuery });
    }
    // Admin and Manager can see all
    else {
      query = Sale.find(parsedQuery);
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
    const total = await Sale.countDocuments();

    query = query.skip(startIndex).limit(limit);

    // Executing query
    const sales = await query;

    // Ensure currency fields are consistent for paginated sales
    const processedSales = sales.map(sale => {
      const saleObj = sale.toObject();
      
      // Ensure currency fields are properly set
      if (!saleObj.totalCostCurrency) {
        saleObj.totalCostCurrency = saleObj.currency || 'USD';
      }
      if (!saleObj.tokenAmountCurrency) {
        saleObj.tokenAmountCurrency = saleObj.currency || 'USD';
      }
      if (!saleObj.currency) {
        saleObj.currency = saleObj.totalCostCurrency || 'USD';
      }
      
      return saleObj;
    });

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

    // Check if this is a request for all sales without pagination
    if (req.query.full === 'true') {
      // Apply the same role-based filtering for full results, but ignore all query parameters
      let fullQuery;
      
      if (req.user.role === 'Sales Person') {
        fullQuery = Sale.find({ 
          salesPerson: req.user.id
        });
      } 
      else if (req.user.role === 'Lead Person') {
        fullQuery = Sale.find({ leadPerson: req.user.id });
      }
      // Only Admin and Manager can see all sales
      else if (req.user.role === 'Admin' || req.user.role === 'Manager') {
        fullQuery = Sale.find({});
      }
      else {
        // For any other role, return empty results
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access sales data'
        });
      }
      
      const allSales = await fullQuery
        .populate('salesPerson leadPerson', 'fullName email')
        .sort('-date');
      
      // Ensure currency fields are consistent for all sales
      const processedSales = allSales.map(sale => {
        const saleObj = sale.toObject();
        
        // Ensure currency fields are properly set
        if (!saleObj.totalCostCurrency) {
          saleObj.totalCostCurrency = saleObj.currency || 'USD';
        }
        if (!saleObj.tokenAmountCurrency) {
          saleObj.tokenAmountCurrency = saleObj.currency || 'USD';
        }
        if (!saleObj.currency) {
          saleObj.currency = saleObj.totalCostCurrency || 'USD';
        }
        
        return saleObj;
      });
      
      return res.status(200).json({
        success: true,
        count: processedSales.length,
        data: processedSales
      });
    }

    res.status(200).json({
      success: true,
      count: processedSales.length,
      pagination,
      data: processedSales
    });
  } catch (err) {
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
    const sale = await Sale.findById(req.params.id).populate('salesPerson leadPerson', 'fullName email');

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    // Check if user can access this sale
    if (req.user.role === 'Sales Person') {
      const salesPersonId = sale.salesPerson?._id?.toString() || sale.salesPerson?.toString();
      const userId = req.user._id?.toString() || req.user.id?.toString();
      
      if (salesPersonId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this sale'
        });
      }
    }

    if (req.user.role === 'Lead Person') {
      const leadPersonId = sale.leadPerson?._id?.toString() || sale.leadPerson?.toString();
      const userId = req.user._id?.toString() || req.user.id?.toString();
      
      if (leadPersonId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this sale'
        });
      }
    }

    res.status(200).json({
      success: true,
      data: sale
    });
  } catch (err) {
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
    // Add user to req.body
    req.body.createdBy = req.user.id;
    
    // If no salesPerson is specified, use the current user
    if (!req.body.salesPerson) {
      req.body.salesPerson = req.user.id;
    }
    
    // Handle reference sales for Sales Person role
    if (req.user.role === 'Sales Person' && req.body.isReference) {
      // For reference sales, set leadPerson to null to show "Reference"
      req.body.leadPerson = null;
    }

    // Create sale
    const sale = await Sale.create(req.body);

    res.status(201).json({
      success: true,
      data: sale
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: message
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
    let sale = await Sale.findById(req.params.id).populate('salesPerson leadPerson', 'fullName email');

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    // Store original values for comparison
    const originalStatus = sale.status;
    const originalTokenAmount = sale.tokenAmount;
    const originalTotalCost = sale.totalCost;

    // Check permissions
    if (req.user.role === 'Sales Person') {
      // Sales person can only update their own sales
      const salesPersonId = sale.salesPerson?._id?.toString() || sale.salesPerson?.toString();
      const userId = req.user._id?.toString() || req.user.id?.toString();
      
      if (salesPersonId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this sale'
        });
      }
    } else if (req.user.role === 'Lead Person') {
      // Lead person can only update sales where they are the lead person
      const leadPersonId = sale.leadPerson?._id?.toString() || sale.leadPerson?.toString();
      const userId = req.user._id?.toString() || req.user.id?.toString();
      
      if (leadPersonId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this sale'
        });
      }
    }

    // Add updatedBy field and timestamp
    req.body.updatedBy = req.user.id;
    req.body.updatedAt = new Date();

    // Ensure remarks is preserved if not provided in update
    if (req.body.remarks === undefined) {
      req.body.remarks = sale.remarks || '';
    }

    // Update the sale with all fields including remarks
    sale = await Sale.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).populate('salesPerson leadPerson', 'fullName email');

    // Email logic - send emails when certain conditions are met
    let emailResults = [];

    // 1. Send payment confirmation email when token amount is updated (and customer has email)
    if (req.body.tokenAmount && req.body.tokenAmount !== originalTokenAmount && req.body.tokenAmount > 0) {
      if (sale.email) {
        try {
          const paymentResult = await sendPaymentConfirmationEmail(sale, sale.salesPerson?.email);
          emailResults.push({
            type: 'payment_confirmation',
            success: paymentResult.success,
            message: paymentResult.success ? 'Payment confirmation email sent' : paymentResult.message
          });
        } catch (emailError) {
          emailResults.push({
            type: 'payment_confirmation',
            success: false,
            message: 'Failed to send payment confirmation email'
          });
        }
      } else {
        emailResults.push({
          type: 'payment_confirmation',
          success: false,
          message: 'Email unavailable - cannot send payment confirmation'
        });
      }
    }

    // 2. Send service delivery email when status changes to "Completed"
    if (req.body.status === 'Completed' && originalStatus !== 'Completed') {
      if (sale.email) {
        try {
          const deliveryResult = await sendServiceDeliveryEmail(sale, sale.salesPerson?.email);
          emailResults.push({
            type: 'service_delivery',
            success: deliveryResult.success,
            message: deliveryResult.success ? 'Service delivery email sent' : deliveryResult.message
          });
        } catch (emailError) {
          emailResults.push({
            type: 'service_delivery',
            success: false,
            message: 'Failed to send service delivery email'
          });
        }
      } else {
        emailResults.push({
          type: 'service_delivery',
          success: false,
          message: 'Email unavailable - cannot send service delivery confirmation'
        });
      }
    }

    res.status(200).json({
      success: true,
      data: sale,
      emailNotifications: emailResults.length > 0 ? emailResults : undefined
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: message
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
        message: 'Sale not found'
      });
    }

    // Check permissions - only sales person who created it, manager, or admin can delete
    if (req.user.role === 'Sales Person') {
      const salesPersonId = sale.salesPerson?._id?.toString() || sale.salesPerson?.toString();
      const userId = req.user._id?.toString() || req.user.id?.toString();
      
      if (salesPersonId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this sale'
        });
      }
    } else if (req.user.role === 'Lead Person') {
      // Lead persons cannot delete sales
      return res.status(403).json({
        success: false,
        message: 'Lead persons cannot delete sales'
      });
    }

    await sale.deleteOne();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
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

    res.status(200).json({
      success: true,
      count
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Import sales from CSV
// @route   POST /api/sales/import
// @access  Private (Admin only)
exports.importSales = async (req, res) => {
  try {
    console.log('=== IMPORT SALES REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('User:', req.user.fullName, req.user.role);
    
    // Handle both direct sales array and nested data structure
    let sales = req.body.sales;
    if (!sales && req.body.data && req.body.data.sales) {
      sales = req.body.data.sales;
      console.log('Found sales in nested data structure');
    }
    
    if (!sales || !Array.isArray(sales) || sales.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No sales data provided or invalid format'
      });
    }
    
    console.log(`Importing ${sales.length} sales from CSV...`);
    
    // Map CSV column names to our database fields
    const mappedSales = sales.map(sale => {
      return {
        customerName: sale.CustomerName || sale['Customer Name'] || sale.customerName || '',
        email: sale.Email || sale.email || '',
        contactNumber: sale.ContactNumber || sale['Contact Number'] || sale.contactNumber || sale.Phone || sale.phone || '',
        countryCode: sale.CountryCode || sale['Country Code'] || sale.countryCode || '+1',
        country: sale.Country || sale.country || '',
        course: sale.Course || sale.course || sale.Product || sale.product || '',
        amount: parseFloat(sale.Amount || sale.amount || sale.Price || sale.price || 0),
        currency: sale.Currency || sale.currency || 'USD',
        status: sale.Status || sale.status || 'Pending',
        paymentMethod: sale.PaymentMethod || sale['Payment Method'] || sale.paymentMethod || 'Unknown',
        date: sale.Date || sale.date ? new Date(sale.Date || sale.date) : new Date(),
        remarks: sale.Remarks || sale.remarks || '',
        // Set created by to the current user (admin)
        createdBy: req.user.id,
        salesPerson: req.user.id // Default to current user, can be updated later
      };
    });
    
    // Validate the mapped data
    const validSales = mappedSales.filter(sale => 
      sale.customerName && sale.contactNumber && sale.course && sale.amount > 0
    );
    
    if (validSales.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid sales found in the imported data'
      });
    }
    
    console.log(`Found ${validSales.length} valid sales out of ${sales.length}`);
    
    // Insert the sales into the database
    const results = await Sale.insertMany(validSales, { 
      ordered: false // Continue processing even if some documents have errors
    });
    
    console.log(`Successfully imported ${results.length} sales`);
    
    res.status(201).json({
      success: true,
      count: results.length,
      data: results,
      errorCount: sales.length - results.length
    });
  } catch (err) {
    console.error('Sales import error:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
}; 