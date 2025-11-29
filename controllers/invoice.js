const Invoice = require('../models/Invoice');
const Sale = require('../models/Sale');
const Lead = require('../models/Lead');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * @desc    Get all invoices with filtering, sorting, and pagination.
 * @route   GET /api/invoices
 * @access  Private (Admin, Manager, Sales Person)
 */
exports.getInvoices = async (req, res) => {
  try {
    console.log('============= GET INVOICES REQUEST =============');
    console.log(`User ID: ${req.user._id}, Role: ${req.user.role}`);

    // Start with a base query for all non-deleted invoices
    let query = Invoice.find({ isDeleted: false });

    // Apply role-based filtering to the query.
    // A Sales Person can only view invoices they have created.
    if (req.user.role === 'Sales Person') {
      query = query.where('createdBy').equals(req.user._id);
      console.log('Applying "Sales Person" filter.');
    } else if (['Manager', 'Admin'].includes(req.user.role)) {
      // Managers and Admins can see all invoices. No additional filtering needed.
      console.log('Accessing all invoices as an Admin or Manager.');
    } else {
      // If the user's role is not recognized, they are not authorized.
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access invoices'
      });
    }

    // Apply additional filters from the query string if they exist.
    const { status, startDate, endDate, clientEmail, invoiceNumber } = req.query;

    if (status) {
      query = query.where('status').equals(status);
    }
    
    // Filter by a date range.
    if (startDate && endDate) {
      query = query.where('invoiceDate').gte(new Date(startDate)).lte(new Date(endDate));
    }
    
    // Case-insensitive regex search for client email.
    if (clientEmail) {
      query = query.where('clientInfo.email').regex(new RegExp(clientEmail, 'i'));
    }
    
    // Case-insensitive regex search for invoice number.
    if (invoiceNumber) {
      query = query.where('invoiceNumber').regex(new RegExp(invoiceNumber, 'i'));
    }

    // Populate related data from other collections for a richer response.
    query = query.populate('createdBy', 'fullName email')
                 .populate('updatedBy', 'fullName email')
                 .populate('relatedSale', 'customerName course totalCost')
                 .populate('relatedLead', 'name course');

    // Sort the results by creation date in descending order (latest first).
    query = query.sort('-createdAt');

    // Implement pagination logic.
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Invoice.countDocuments({ isDeleted: false });

    query = query.skip(startIndex).limit(limit);

    const invoices = await query;

    // Create a pagination result object to help the client navigate pages.
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

    console.log(`Found ${invoices.length} invoices out of a total of ${total}.`);

    res.status(200).json({
      success: true,
      count: invoices.length,
      pagination,
      data: invoices
    });
  } catch (err) {
    console.error('Error fetching invoices:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

/**
 * @desc    Get a single invoice by its ID.
 * @route   GET /api/invoices/:id
 * @access  Private (Admin, Manager, Sales Person)
 */
exports.getInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email')
      .populate('relatedSale', 'customerName course totalCost')
      .populate('relatedLead', 'name course')
      .populate('payments.recordedBy', 'fullName');

    // Check if the invoice exists and is not soft-deleted.
    if (!invoice || invoice.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Sales Person authorization check: a sales person can only see their own invoices.
    if (req.user.role === 'Sales Person' && invoice.createdBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this invoice'
      });
    }

    res.status(200).json({
      success: true,
      data: invoice
    });
  } catch (err) {
    console.error('Error fetching invoice:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

/**
 * @desc    Create a new invoice.
 * @route   POST /api/invoices
 * @access  Private (Admin, Manager, Sales Person)
 */
exports.createInvoice = async (req, res) => {
  try {
    console.log('============= CREATE INVOICE REQUEST =============');
    console.log('Received invoice data:', JSON.stringify(req.body, null, 2));

    const invoiceNumber = await Invoice.generateInvoiceNumber();
    
    req.body.createdBy = req.user._id;
    req.body.invoiceNumber = invoiceNumber;

    if (req.body.paymentTerms && req.body.paymentTerms !== 'Due on Receipt') {
      const days = parseInt(req.body.paymentTerms.split(' ')[1]) || 30;
      req.body.dueDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    if (!req.body.relatedSale || req.body.relatedSale === '') {
      delete req.body.relatedSale;
    }
    if (!req.body.relatedLead || req.body.relatedLead === '') {
      delete req.body.relatedLead;
    }

    // Recalculate totals on the server to ensure accuracy.
    let subtotal = 0;
    req.body.items.forEach(item => {
      // Calculate the subtotal for each item.
      const itemSubtotal = (item.unitPrice || 0) * (item.quantity || 1);
      // Recalculate the GST for each item based on an 18% rate.
      item.gst = parseFloat((itemSubtotal * 0.18).toFixed(2));
      // Recalculate the total for each item.
      item.total = itemSubtotal + item.gst;
      // Accumulate the overall subtotal.
      subtotal += itemSubtotal;
    });

    // Calculate the overall GST and total amounts.
    const gstAmount = parseFloat((subtotal * 0.18).toFixed(2));
    const totalAmount = subtotal + gstAmount;

    req.body.subtotal = subtotal;
    req.body.gstAmount = gstAmount;
    req.body.totalAmount = totalAmount;

    if (typeof req.body.balanceDue === 'undefined') {
      req.body.balanceDue = totalAmount || 0;
    }
    if (typeof req.body.amountPaid === 'undefined') {
      req.body.amountPaid = 0;
    }

    console.log('Processed data before creating invoice:', JSON.stringify(req.body, null, 2));

    const invoice = await Invoice.create(req.body);

    const populatedInvoice = await Invoice.findById(invoice._id)
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email')
      .populate('relatedSale', 'customerName course totalCost')
      .populate('relatedLead', 'name course');

    console.log(`Invoice created successfully with number: ${populatedInvoice.invoiceNumber}`);

    res.status(201).json({
      success: true,
      data: populatedInvoice
    });
  } catch (err) {
    console.error('Error creating invoice:', err);
    console.error('Request body that caused the error:', JSON.stringify(req.body, null, 2));
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      console.error('Validation errors:', messages);
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

/**
 * @desc    Update an existing invoice.
 * @route   PUT /api/invoices/:id
 * @access  Private (Admin, Manager, Sales Person)
 */
exports.updateInvoice = async (req, res) => {
  try {
    console.log('============= UPDATE INVOICE REQUEST =============');
    console.log(`Updating invoice ID: ${req.params.id}`);

    let invoice = await Invoice.findById(req.params.id);

    if (!invoice || invoice.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    if (req.user.role === 'Sales Person' && invoice.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this invoice'
      });
    }

    req.body.updatedBy = req.user._id;

    if (req.body.paymentTerms && req.body.paymentTerms !== 'Due on Receipt') {
      const days = parseInt(req.body.paymentTerms.split(' ')[1]) || 30;
      req.body.dueDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    if (req.body.items) {
      let subtotal = 0;
      req.body.items.forEach(item => {
        const itemSubtotal = (item.unitPrice || 0) * (item.quantity || 1);
        item.gst = parseFloat((itemSubtotal * 0.18).toFixed(2));
        item.total = itemSubtotal + item.gst;
        subtotal += itemSubtotal;
      });

      const gstAmount = parseFloat((subtotal * 0.18).toFixed(2));
      const totalAmount = subtotal + gstAmount;
      
      req.body.subtotal = subtotal;
      req.body.gstAmount = gstAmount;
      req.body.totalAmount = totalAmount;
    }

    invoice = await Invoice.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email')
      .populate('relatedSale', 'customerName course totalCost')
      .populate('relatedLead', 'name course');

    console.log(`Invoice updated successfully: ${invoice.invoiceNumber}`);

    res.status(200).json({
      success: true,
      data: invoice
    });
  } catch (err) {
    console.error('Error updating invoice:', err);
    
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

/**
 * @desc    Soft delete an invoice. This marks it as deleted but doesn't remove it from the database.
 * @route   DELETE /api/invoices/:id
 * @access  Private (Admin, Manager)
 */
exports.deleteInvoice = async (req, res) => {
  try {
    console.log('============= DELETE INVOICE REQUEST =============');
    console.log(`Attempting to soft-delete invoice ID: ${req.params.id}`);
    
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice || invoice.isDeleted) {
      console.log('Invoice not found or already deleted.');
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    if (!['Admin', 'Manager'].includes(req.user.role)) {
      console.log('User not authorized to delete invoices.');
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete invoices'
      });
    }

    invoice.isDeleted = true;
    invoice.updatedBy = req.user._id;
    await invoice.save();

    console.log(`Invoice ${invoice.invoiceNumber} soft-deleted successfully.`);

    res.status(200).json({
      success: true,
      message: 'Invoice deleted successfully'
    });
  } catch (err) {
      console.error('Error deleting invoice:', err);
      res.status(500).json({
          success: false,
          message: 'Server Error'
      });
  }
};

/**
 * @desc    Generate a PDF for an invoice to be viewed in the browser.
 * @route   GET /api/invoices/:id/pdf
 * @access  Private (Admin, Manager, Sales Person)
 */
exports.generatePDF = async (req, res) => {
  try {
    console.log('============= GENERATE PDF REQUEST =============');

    const invoice = await Invoice.findById(req.params.id)
      .populate('createdBy', 'fullName email')
      .populate('relatedSale', 'customerName course totalCost')
      .populate('relatedLead', 'name course');

    if (!invoice || invoice.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    if (req.user.role === 'Sales Person' && invoice.createdBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this invoice'
      });
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Invoice-${invoice.invoiceNumber}.pdf"`);

    doc.pipe(res);

    generatePDFContent(doc, invoice);

    doc.end();

    console.log(`PDF generated successfully for invoice: ${invoice.invoiceNumber}`);

  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF'
    });
  }
};

/**
 * @desc    Generate a PDF for an invoice to be downloaded.
 * @route   GET /api/invoices/:id/download
 * @access  Private (Admin, Manager, Sales Person)
 */
exports.downloadPDF = async (req, res) => {
  try {
    console.log('============= DOWNLOAD PDF REQUEST =============');

    const invoice = await Invoice.findById(req.params.id)
      .populate('createdBy', 'fullName email')
      .populate('relatedSale', 'customerName course totalCost')
      .populate('relatedLead', 'name course');

    if (!invoice || invoice.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    if (req.user.role === 'Sales Person' && invoice.createdBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this invoice'
      });
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`);

    doc.pipe(res);

    generatePDFContent(doc, invoice);

    doc.end();

    console.log(`PDF downloaded successfully for invoice: ${invoice.invoiceNumber}`);

  } catch (err) {
    console.error('Error downloading PDF:', err);
    res.status(500).json({
      success: false,
      message: 'Error downloading PDF'
    });
  }
};

/**
 * @desc    Record a new payment for an invoice.
 * @route   POST /api/invoices/:id/payment
 * @access  Private (Admin, Manager, Sales Person)
 */
exports.recordPayment = async (req, res) => {
  try {
    console.log('============= RECORD PAYMENT REQUEST =============');
    console.log(`Recording payment for invoice ID: ${req.params.id}`);

    const invoice = await Invoice.findById(req.params.id);

    if (!invoice || invoice.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    if (req.user.role === 'Sales Person' && invoice.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to record payment for this invoice'
      });
    }

    const { amount, method, reference, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount must be greater than 0'
      });
    }

    invoice.payments.push({
      date: new Date(),
      amount: parseFloat(amount),
      method,
      reference,
      notes,
      recordedBy: req.user._id
    });

    invoice.amountPaid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
    invoice.balanceDue = invoice.totalAmount - invoice.amountPaid;

    if (invoice.amountPaid >= invoice.totalAmount) {
      invoice.status = 'Paid';
    } else if (invoice.amountPaid > 0) {
      invoice.status = 'Partially Paid';
    }

    invoice.updatedBy = req.user._id;
    await invoice.save();

    const updatedInvoice = await Invoice.findById(invoice._id)
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email')
      .populate('payments.recordedBy', 'fullName')
      .populate('relatedSale', 'customerName course totalCost')
      .populate('relatedLead', 'name course');

    console.log(`Payment of ${amount} recorded successfully for invoice: ${invoice.invoiceNumber}`);

    res.status(200).json({
      success: true,
      data: updatedInvoice
    });
  } catch (err) {
    console.error('Error recording payment:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

/**
 * @desc    Get key invoice statistics for a dashboard.
 * @route   GET /api/invoices/stats
 * @access  Private (Admin, Manager)
 */
exports.getInvoiceStats = async (req, res) => {
  try {
    console.log('============= GET INVOICE STATS REQUEST =============');

    if (!['Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access invoice statistics'
      });
    }

    const { startDate, endDate } = req.query;
    let dateFilter = { isDeleted: false };
    if (startDate && endDate) {
      dateFilter.invoiceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const totalInvoices = await Invoice.countDocuments(dateFilter);

    const statusStats = await Invoice.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

    const totalRevenue = await Invoice.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' },
          paid: { $sum: '$amountPaid' },
          outstanding: { $sum: '$balanceDue' }
        }
      }
    ]);

    const monthlyRevenue = await Invoice.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            year: { $year: '$invoiceDate' },
            month: { $month: '$invoiceDate' }
          },
          revenue: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    const stats = {
      totalInvoices,
      statusStats: statusStats.reduce((acc, stat) => {
        acc[stat._id] = { count: stat.count, totalAmount: stat.totalAmount };
        return acc;
      }, {}),
      totalRevenue: totalRevenue[0] || { total: 0, paid: 0, outstanding: 0 },
      monthlyRevenue
    };

    console.log('Invoice statistics generated successfully.');

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (err) {
    console.error('Error getting invoice stats:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

/**
 * @desc    Helper function to generate the content for the PDF using pdfkit.
 * @param   {object} doc - The PDFDocument instance.
 * @param   {object} invoice - The invoice data object.
 */
function generatePDFContent(doc, invoice) {
  // Define layout dimensions for an A4 page with margins.
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 50;
  const contentWidth = pageWidth - (margin * 2);
  let y = margin;
  const primaryColor = '#0b0f2a';
  const secondaryColor = '#000000';
  const tableHeaderColor = '#F2F2F2';
  const boxBackgroundColor = '#f0ecf9';
  const textPadding = 10;

  // Set the white background for the entire page.
  doc.rect(0, 0, pageWidth, pageHeight).fill('#ffffff');

  // Register Unicode fonts (for ₹) if available; otherwise fall back.
  let customFontsLoaded = false;
  let currencySymbol = 'Rs.';
  try {
    const fontsDir = path.join(__dirname, '../assets/fonts');
    const regularFontPath = path.join(fontsDir, 'NotoSans-Regular.ttf');
    const boldFontPath = path.join(fontsDir, 'NotoSans-Bold.ttf');
    if (fs.existsSync(regularFontPath) && fs.existsSync(boldFontPath)) {
      doc.registerFont('AppFont-Regular', regularFontPath);
      doc.registerFont('AppFont-Bold', boldFontPath);
      customFontsLoaded = true;
      currencySymbol = '₹';
    }
  } catch (e) {
    customFontsLoaded = false;
    currencySymbol = 'Rs.';
  }

  // Derive the desired symbol from invoice data
  const symbolMap = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', AUD: 'A$', CAD: 'C$', SGD: 'S$' };
  const desiredSymbol = invoice.currencySymbol || symbolMap[invoice.currency];
  if (desiredSymbol) currencySymbol = desiredSymbol;
  if (currencySymbol === '₹' && !customFontsLoaded) currencySymbol = 'Rs.';

  // Locale for number formatting
  const numberLocale = invoice.currency === 'INR' ? 'en-IN' : 'en-US';

  // Helper function for text with the new color scheme.
  const addText = (text, x, y, options = {}) => {
    const { fontSize = 10, bold = false, color = secondaryColor, align = 'left', width = undefined } = options;
    doc.fontSize(fontSize).fillColor(color);
    if (customFontsLoaded) {
      doc.font(bold ? 'AppFont-Bold' : 'AppFont-Regular');
    } else {
      if (bold) doc.font('Helvetica-Bold');
      else doc.font('Helvetica');
    }
    doc.text(text, x, y, { align, width });
  };

  // Helper function to add an image.
  const addImage = (imagePath, x, y, width, options = {}) => {
    try {
      // Check if file exists before trying to load it
      if (fs.existsSync(imagePath)) {
        doc.image(imagePath, x, y, { width, ...options });
      } else {
        console.error('Image file not found:', imagePath);
        addText('Image could not be loaded.', x, y, { color: 'red' });
      }
    } catch (error) {
      console.error('Error loading image:', error);
      addText('Image could not be loaded.', x, y, { color: 'red' });
    }
  };
  
     // ✅ Utility to format numbers cleanly (removes stray symbols and adds commas)
   const formatNumber = (num) => {
     if (typeof num !== 'string' && typeof num !== 'number') {
       return '0.00';
     }

     // Remove everything except digits, dot, minus sign
     const cleanNum = String(num)
       .replace(/[^\d.-]/g, '') // strip ₹, commas, superscripts, etc.
       .trim();

     const parsedNum = parseFloat(cleanNum);
     if (isNaN(parsedNum)) {
       return '0.00';
     }

     // Return with commas and 2 decimal places
     return parsedNum.toLocaleString(numberLocale, {
       minimumFractionDigits: 2,
       maximumFractionDigits: 2,
     });
   };

  // --- Header Section ---
  const logoWidth = 80;
  const logoHeight = 50;
  const logoX = pageWidth - margin - logoWidth;
  const logoY = y;
  
  const logoPath = path.join(__dirname, '../assets/images/traincape-logo.jpg');
  addImage(logoPath, logoX, logoY, logoWidth, { height: logoHeight });

  const invoiceDetailsX = margin;
  addText('GST Invoice', invoiceDetailsX, logoY, { fontSize: 18, bold: true, color: primaryColor });
  
  let invoiceInfoY = logoY + 20;
  addText('Invoice No#:', invoiceDetailsX, invoiceInfoY, { fontSize: 9, bold: true, color: primaryColor });
  addText(invoice.invoiceNumber, invoiceDetailsX + 70, invoiceInfoY, { fontSize: 9, color: primaryColor });
  invoiceInfoY += 15;
  addText('Invoice Date:', invoiceDetailsX, invoiceInfoY, { fontSize: 9, bold: true, color: primaryColor });
  addText(new Date(invoice.invoiceDate).toLocaleDateString(), invoiceDetailsX + 70, invoiceInfoY, { fontSize: 9, color: primaryColor });

  y = Math.max(invoiceInfoY, logoY + logoHeight) + 20;

  // --- Company Details Box ---
  const boxWidth = contentWidth / 2 - 10;
  const box1X = margin;
  const box1Y = y;
  
  const companyAddressLines = [
    invoice.companyInfo.address.street,
    `${invoice.companyInfo.address.city}, ${invoice.companyInfo.address.state}`,
    'India-110045'
  ].join('\n');
  const companyInfoText = `${invoice.companyInfo.name}\nEducation - Training\n\n${companyAddressLines}\n\n` +
                          `GSTIN: ${invoice.companyInfo.gstin}\n` +
                          `PAN: ${invoice.companyInfo.pan || 'Not Provided'}\n` +
                          `Email: ${invoice.companyInfo.email}\n` +
                          `Phone: ${invoice.companyInfo.phone}`;

  const companyBoxHeight = doc.heightOfString(companyInfoText, { width: boxWidth - (textPadding * 2) }) + (textPadding * 2);

  // --- Billed To Box ---
  const box2X = pageWidth - margin - boxWidth;
  const box2Y = y;

  const clientAddressLines = [
    invoice.clientInfo.address.street,
    `${invoice.clientInfo.address.city}, ${invoice.clientInfo.address.state}`,
    `${invoice.clientInfo.address.zipCode}, ${invoice.clientInfo.address.country}`
  ].join('\n');
  const clientInfoText = `Billed To\n\n${invoice.clientInfo.name}\n${invoice.clientInfo.company ? `${invoice.clientInfo.company}\n` : ''}${clientAddressLines}\n\n` +
                          `Email: ${invoice.clientInfo.email}\n` +
                          `Phone: ${invoice.clientInfo.phone}`;
  
  const clientBoxHeight = doc.heightOfString(clientInfoText, { width: boxWidth - (textPadding * 2) }) + (textPadding * 2) + 15;

  doc.rect(box1X, box1Y, boxWidth, companyBoxHeight).fill(boxBackgroundColor);
  doc.rect(box2X, box2Y, boxWidth, clientBoxHeight).fill(boxBackgroundColor);
  
  let boxY = box1Y + textPadding;
  doc.fontSize(12).fillColor('#6539c0').text(invoice.companyInfo.name, box1X + textPadding, boxY, { bold: true });
  boxY += 15;
  doc.fontSize(9).fillColor(primaryColor).text('Education - Training', box1X + textPadding, boxY);
  boxY += 15;
  doc.fontSize(8).fillColor(primaryColor).text(invoice.companyInfo.address.street, box1X + textPadding, boxY, { width: boxWidth - (textPadding * 2) });
  doc.text(`${invoice.companyInfo.address.city}, ${invoice.companyInfo.address.state}`, { width: boxWidth - (textPadding * 2) });
  doc.text(`India-110045`, { width: boxWidth - (textPadding * 2) });
  boxY = doc.y + 10;

  doc.text(`GSTIN: ${invoice.companyInfo.gstin}`, box1X + textPadding, boxY, { width: boxWidth - (textPadding * 2) });
  boxY += 12;
  doc.text(`PAN: ${invoice.companyInfo.pan || 'Not Provided'}`, box1X + textPadding, boxY, { width: boxWidth - (textPadding * 2) });
  boxY += 12;
  doc.text(`Email: ${invoice.companyInfo.email}`, box1X + textPadding, boxY, { width: boxWidth - (textPadding * 2) });
  boxY += 12;
  doc.text(`Phone: ${invoice.companyInfo.phone}`, box1X + textPadding, boxY, { width: boxWidth - (textPadding * 2) });

  boxY = box2Y + textPadding;
  doc.fontSize(10).fillColor('#6539c0').text('Billed To', box2X + textPadding, boxY, { bold: true });
  boxY += 15;
  doc.fontSize(9).fillColor(primaryColor).text(invoice.clientInfo.name, box2X + textPadding, boxY, { bold: true, width: boxWidth - (textPadding * 2) });
  boxY += 12;
  
  // Add company name if available
  if (invoice.clientInfo.company) {
    doc.fontSize(8).fillColor(primaryColor).text(invoice.clientInfo.company, box2X + textPadding, boxY, { width: boxWidth - (textPadding * 2) });
    boxY += 12;
  }
  
  doc.fontSize(8).fillColor(primaryColor).text(`${invoice.clientInfo.address.street}`, box2X + textPadding, boxY, { width: boxWidth - (textPadding * 2) });
  boxY += 12;
  doc.text(`${invoice.clientInfo.address.city}, ${invoice.clientInfo.address.state}`, { width: boxWidth - (textPadding * 2) });
  boxY += 12;
  doc.text(`${invoice.clientInfo.address.zipCode}, ${invoice.clientInfo.address.country}`, { width: boxWidth - (textPadding * 2) });
  boxY += 15;
  
  // Add client contact details
  doc.text(`Email: ${invoice.clientInfo.email}`, box2X + textPadding, boxY, { width: boxWidth - (textPadding * 2) });
  boxY += 12;
  doc.text(`Phone: ${invoice.clientInfo.phone}`, box2X + textPadding, boxY, { width: boxWidth - (textPadding * 2) });

  y = Math.max(box1Y + companyBoxHeight, box2Y + clientBoxHeight) + 20;

  // --- Items Table ---
  const col1X = margin + 8;
  const col2X = margin + 200;
  const col3X = margin + 280;
  const col4X = margin + 360;
  const col5X = margin + 440;
  const colWidth = pageWidth - col5X - margin;

  doc.rect(margin, y, contentWidth, 20).fillAndStroke(tableHeaderColor, tableHeaderColor);
  addText('DESCRIPTION', col1X, y + 6, { fontSize: 8, bold: true, color: primaryColor });
  addText('UNIT PRICE', col2X, y + 6, { fontSize: 8, bold: true, color: primaryColor, align: 'right', width: 70 });
  addText('GST', col3X, y + 6, { fontSize: 8, bold: true, color: primaryColor, align: 'right', width: 70 });
  addText('QTY', col4X, y + 6, { fontSize: 8, bold: true, color: primaryColor, align: 'right', width: 70 });
  addText('TOTAL', col5X, y + 6, { fontSize: 8, bold: true, color: primaryColor, align: 'right', width: colWidth });
  y += 20;

  invoice.items.forEach(item => {
    addText(item.description || '', col1X, y + 6, { fontSize: 8, color: primaryColor });
    addText(formatNumber(item.unitPrice), col2X, y + 6, { fontSize: 8, color: primaryColor, align: 'right', width: 70 });
    addText(formatNumber(item.gst), col3X, y + 6, { fontSize: 8, color: primaryColor, align: 'right', width: 70 });
    addText(item.quantity.toString(), col4X, y + 6, { fontSize: 8, color: primaryColor, align: 'right', width: 70 });
    
    // ✅ Clean number formatting with proper currency symbol and font handling
    addText(`${currencySymbol} ${formatNumber(item.total)}`, col5X, y + 6, { fontSize: 8, color: primaryColor, align: 'right', width: colWidth });
    y += 20;
  });
  y += 5;

  // --- Totals Section ---
  const totalsX = pageWidth - margin - 200;
  const totalsLineSpacing = 16;
  const totalsValueX = totalsX + 90;
  const totalsValueWidth = 100;
  
  addText('SUBTOTAL', totalsX, y, { fontSize: 9, bold: true, color: primaryColor });
  // ✅ Clean number formatting with proper currency symbol and font handling
  addText(`${currencySymbol} ${formatNumber(invoice.subtotal)}`, totalsValueX, y, { fontSize: 9, bold: true, color: primaryColor, align: 'right', width: totalsValueWidth });
  y += totalsLineSpacing;
  
  addText('GST 18%', totalsX, y, { fontSize: 9, bold: true, color: primaryColor });
  // ✅ Clean number formatting with proper currency symbol and font handling
  addText(`${currencySymbol} ${formatNumber(invoice.gstAmount)}`, totalsValueX, y, { fontSize: 9, bold: true, color: primaryColor, align: 'right', width: totalsValueWidth });
  y += totalsLineSpacing;
  
  addText('TOTAL', totalsX, y, { fontSize: 9, bold: true, color: primaryColor });
  // ✅ Clean number formatting with proper currency symbol and font handling
  addText(`${currencySymbol} ${formatNumber(invoice.totalAmount)}`, totalsValueX, y, { fontSize: 9, bold: true, color: primaryColor, align: 'right', width: totalsValueWidth });
  y += totalsLineSpacing;
  y += 30;

  // --- Signature Section ---
  const signaturePath = path.join(__dirname, '../assets/images/sign.jpg');
  const signatureWidth = 120;
  const signatureHeight = 60;
  const signatureX = pageWidth - margin - signatureWidth - 20;
  
  addImage(signaturePath, signatureX, y, signatureWidth, { height: signatureHeight });
  y += signatureHeight + 5;
  addText('Authorized Signature', signatureX + 10, y, { fontSize: 9, color: secondaryColor });

  // // --- Footer Logos ---
  // const footerY = pageHeight - margin - 20;
  // addText('TRAINCAPE', margin, footerY, { fontSize: 11, bold: true, color: primaryColor });
  // addText('TECHNOLOGY Pvt. Ltd.', margin + 80, footerY + 1, { fontSize: 9, color: primaryColor });
}
