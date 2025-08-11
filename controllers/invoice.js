const Invoice = require('../models/Invoice');
const Sale = require('../models/Sale');
const Lead = require('../models/Lead');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private (Admin, Manager, Sales Person)
exports.getInvoices = async (req, res) => {
  try {
    console.log('============= GET INVOICES REQUEST =============');
    console.log('User making request:', {
      id: req.user._id,
      role: req.user.role,
      name: req.user.fullName
    });

    let query = Invoice.find({ isDeleted: false });

    // Role-based filtering
    if (req.user.role === 'Sales Person') {
      // Sales Person can only see invoices they created
      query = query.where('createdBy').equals(req.user._id);
    } else if (req.user.role === 'Manager') {
      // Manager can see all invoices
      query = query;
    } else if (req.user.role === 'Admin') {
      // Admin can see all invoices
      query = query;
    } else {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access invoices'
      });
    }

    // Apply filters
    const { status, startDate, endDate, clientEmail, invoiceNumber } = req.query;
    
    if (status) {
      query = query.where('status').equals(status);
    }
    
    if (startDate && endDate) {
      query = query.where('invoiceDate').gte(new Date(startDate)).lte(new Date(endDate));
    }
    
    if (clientEmail) {
      query = query.where('clientInfo.email').regex(new RegExp(clientEmail, 'i'));
    }
    
    if (invoiceNumber) {
      query = query.where('invoiceNumber').regex(new RegExp(invoiceNumber, 'i'));
    }

    // Populate related data
    query = query.populate('createdBy', 'fullName email')
                 .populate('updatedBy', 'fullName email')
                 .populate('relatedSale', 'customerName course totalCost')
                 .populate('relatedLead', 'name course');

    // Sort by latest first
    query = query.sort('-createdAt');

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Invoice.countDocuments({ isDeleted: false });

    query = query.skip(startIndex).limit(limit);

    const invoices = await query;

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

    console.log(`Found ${invoices.length} invoices`);

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

// @desc    Get single invoice
// @route   GET /api/invoices/:id
// @access  Private (Admin, Manager, Sales Person)
exports.getInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email')
      .populate('relatedSale', 'customerName course totalCost')
      .populate('relatedLead', 'name course')
      .populate('payments.recordedBy', 'fullName');

    if (!invoice || invoice.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check authorization
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

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Private (Admin, Manager, Sales Person)
exports.createInvoice = async (req, res) => {
  try {
    console.log('============= CREATE INVOICE REQUEST =============');
    console.log('Invoice data:', req.body);

    // Generate invoice number
    const invoiceNumber = await Invoice.generateInvoiceNumber();
    
    // Set created by
    req.body.createdBy = req.user._id;
    req.body.invoiceNumber = invoiceNumber;

    // Calculate due date based on payment terms
    if (req.body.paymentTerms && req.body.paymentTerms !== 'Due on Receipt') {
      const days = parseInt(req.body.paymentTerms.split(' ')[1]) || 30;
      req.body.dueDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    // Handle empty ObjectId fields
    if (!req.body.relatedSale || req.body.relatedSale === '') {
      delete req.body.relatedSale;
    }
    if (!req.body.relatedLead || req.body.relatedLead === '') {
      delete req.body.relatedLead;
    }

    // Ensure all required numeric fields are present
    if (typeof req.body.subtotal === 'undefined') {
      req.body.subtotal = req.body.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    }
    if (typeof req.body.totalAmount === 'undefined') {
      req.body.totalAmount = req.body.items.reduce((sum, item) => sum + (item.total || 0), 0);
    }
    if (typeof req.body.balanceDue === 'undefined') {
      req.body.balanceDue = req.body.totalAmount || 0;
    }
    if (typeof req.body.amountPaid === 'undefined') {
      req.body.amountPaid = 0;
    }

    console.log('Processed invoice data:', JSON.stringify(req.body, null, 2));

    // Create invoice
    const invoice = await Invoice.create(req.body);

    // Populate related data
    const populatedInvoice = await Invoice.findById(invoice._id)
      .populate('createdBy', 'fullName email')
      .populate('relatedSale', 'customerName course totalCost')
      .populate('relatedLead', 'name course');

    console.log('Invoice created successfully:', populatedInvoice.invoiceNumber);

    res.status(201).json({
      success: true,
      data: populatedInvoice
    });
  } catch (err) {
    console.error('Error creating invoice:', err);
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    
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

// @desc    Update invoice
// @route   PUT /api/invoices/:id
// @access  Private (Admin, Manager, Sales Person)
exports.updateInvoice = async (req, res) => {
  try {
    console.log('============= UPDATE INVOICE REQUEST =============');
    console.log('Update data:', req.body);

    let invoice = await Invoice.findById(req.params.id);

    if (!invoice || invoice.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check authorization
    if (req.user.role === 'Sales Person' && invoice.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this invoice'
      });
    }

    // Set updated by
    req.body.updatedBy = req.user._id;

    // Calculate due date based on payment terms
    if (req.body.paymentTerms && req.body.paymentTerms !== 'Due on Receipt') {
      const days = parseInt(req.body.paymentTerms.split(' ')[1]) || 30;
      req.body.dueDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    invoice = await Invoice.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email')
      .populate('relatedSale', 'customerName course totalCost')
      .populate('relatedLead', 'name course');

    console.log('Invoice updated successfully:', invoice.invoiceNumber);

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

// @desc    Delete invoice (soft delete)
// @route   DELETE /api/invoices/:id
// @access  Private (Admin, Manager)
exports.deleteInvoice = async (req, res) => {
  try {
    console.log('============= DELETE INVOICE REQUEST =============');
    console.log('Invoice ID to delete:', req.params.id);
    console.log('User making request:', {
      id: req.user._id,
      role: req.user.role,
      name: req.user.fullName
    });

    const invoice = await Invoice.findById(req.params.id);

    if (!invoice || invoice.isDeleted) {
      console.log('Invoice not found or already deleted');
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    console.log('Found invoice:', {
      id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      isDeleted: invoice.isDeleted
    });

    // Check authorization
    if (!['Admin', 'Manager'].includes(req.user.role)) {
      console.log('User not authorized to delete invoices');
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete invoices'
      });
    }

    // Soft delete
    invoice.isDeleted = true;
    invoice.updatedBy = req.user._id;
    await invoice.save();

    console.log('Invoice soft deleted successfully:', invoice.invoiceNumber);

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

// @desc    Generate PDF invoice
// @route   GET /api/invoices/:id/pdf
// @access  Private (Admin, Manager, Sales Person)
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

    // Check authorization
    if (req.user.role === 'Sales Person' && invoice.createdBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this invoice'
      });
    }

    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Invoice-${invoice.invoiceNumber}.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Generate PDF content
    generatePDFContent(doc, invoice);

    // Finalize PDF
    doc.end();

    console.log('PDF generated successfully for invoice:', invoice.invoiceNumber);

  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF'
    });
  }
};

// @desc    Download PDF invoice
// @route   GET /api/invoices/:id/download
// @access  Private (Admin, Manager, Sales Person)
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

    // Check authorization
    if (req.user.role === 'Sales Person' && invoice.createdBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this invoice'
      });
    }

    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });

    // Set response headers for download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Generate PDF content
    generatePDFContent(doc, invoice);

    // Finalize PDF
    doc.end();

    console.log('PDF downloaded successfully for invoice:', invoice.invoiceNumber);

  } catch (err) {
    console.error('Error downloading PDF:', err);
    res.status(500).json({
      success: false,
      message: 'Error downloading PDF'
    });
  }
};

// @desc    Record payment
// @route   POST /api/invoices/:id/payment
// @access  Private (Admin, Manager, Sales Person)
exports.recordPayment = async (req, res) => {
  try {
    console.log('============= RECORD PAYMENT REQUEST =============');
    console.log('Payment data:', req.body);

    const invoice = await Invoice.findById(req.params.id);

    if (!invoice || invoice.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check authorization
    if (req.user.role === 'Sales Person' && invoice.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to record payment for this invoice'
      });
    }

    const { amount, method, reference, notes } = req.body;

    // Validate payment amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount must be greater than 0'
      });
    }

    // Add payment to invoice
    invoice.payments.push({
      date: new Date(),
      amount: parseFloat(amount),
      method,
      reference,
      notes,
      recordedBy: req.user._id
    });

    // Update amount paid
    invoice.amountPaid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
    invoice.balanceDue = invoice.totalAmount - invoice.amountPaid;

    // Update status
    if (invoice.amountPaid >= invoice.totalAmount) {
      invoice.status = 'Paid';
    } else if (invoice.amountPaid > 0) {
      invoice.status = 'Partially Paid';
    }

    invoice.updatedBy = req.user._id;
    await invoice.save();

    // Populate related data
    const updatedInvoice = await Invoice.findById(invoice._id)
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email')
      .populate('payments.recordedBy', 'fullName')
      .populate('relatedSale', 'customerName course totalCost')
      .populate('relatedLead', 'name course');

    console.log('Payment recorded successfully for invoice:', invoice.invoiceNumber);

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

// @desc    Get invoice statistics
// @route   GET /api/invoices/stats
// @access  Private (Admin, Manager)
exports.getInvoiceStats = async (req, res) => {
  try {
    console.log('============= GET INVOICE STATS REQUEST =============');

    // Check authorization
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

    // Get total invoices
    const totalInvoices = await Invoice.countDocuments(dateFilter);

    // Get invoices by status
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

    // Get total revenue
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

    // Get monthly revenue for the last 12 months
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

    console.log('Invoice statistics generated successfully');

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

// Helper function to generate PDF content
function generatePDFContent(doc, invoice) {
  const pageWidth = doc.page.width;
  const margin = 40;
  const contentWidth = pageWidth - (margin * 2);
  let y = margin;

  // Colors
  const primaryColor = '#2563eb';
  const secondaryColor = '#64748b';
  const textColor = '#1e293b';

  // Helper for text
  const addText = (text, x, y, options = {}) => {
    const { fontSize = 10, bold = false, color = textColor, align = 'left', width = undefined } = options;
    doc.fontSize(fontSize).fillColor(color);
    if (bold) doc.font('Helvetica-Bold');
    else doc.font('Helvetica');
    doc.text(text, x, y, { align, width });
  };

  // --- Header: Logo + Company Info ---
  const logoPath = path.join(__dirname, '../assets/images/traincape-logo.jpg');
  let logoHeight = 0;
  try {
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, margin, y, { width: 50, height: 40 });
      logoHeight = 40;
    }
  } catch (error) {}

  // Company Info (right side)
  const companyX = pageWidth - margin - 220;
  let companyY = y;
  addText(invoice.companyInfo.name, companyX, companyY, { fontSize: 13, bold: true, color: primaryColor });
  companyY += 16;
  addText(invoice.companyInfo.address.street, companyX, companyY, { fontSize: 8 });
  companyY += 12;
  addText(`${invoice.companyInfo.address.city}, ${invoice.companyInfo.address.state}`, companyX, companyY, { fontSize: 8 });
  companyY += 12;
  if (invoice.companyInfo.email) {
    addText(`Email: ${invoice.companyInfo.email}`, companyX, companyY, { fontSize: 8, color: secondaryColor });
    companyY += 12;
  }
  if (invoice.companyInfo.phone) {
    addText(`Phone: ${invoice.companyInfo.phone}`, companyX, companyY, { fontSize: 8, color: secondaryColor });
    companyY += 12;
  }
  y += Math.max(logoHeight, companyY - margin, 60) + 10;

  // --- Invoice Title & Details ---
  addText('INVOICE', margin, y, { fontSize: 18, bold: true, color: primaryColor });
  const detailsX = pageWidth - margin - 200;
  addText('Invoice #:', detailsX, y, { fontSize: 10, bold: true });
  addText(invoice.invoiceNumber, detailsX + 70, y, { fontSize: 10, color: primaryColor });
  addText('Date:', detailsX, y + 15, { fontSize: 10, bold: true });
  addText(new Date(invoice.invoiceDate).toLocaleDateString(), detailsX + 70, y + 15, { fontSize: 10 });
  addText('Status:', detailsX, y + 30, { fontSize: 10, bold: true });
  addText(invoice.status, detailsX + 70, y + 30, { fontSize: 10, color: primaryColor });
  y += 40;

  // --- Bill To ---
  addText('BILL TO:', margin, y, { fontSize: 11, bold: true, color: primaryColor });
  y += 14;
  addText(invoice.clientInfo.name, margin, y, { fontSize: 10, bold: true });
  y += 12;
  if (invoice.clientInfo.company) {
    addText(invoice.clientInfo.company, margin, y, { fontSize: 9 });
    y += 10;
  }
  if (invoice.clientInfo.address.street && invoice.clientInfo.address.street !== 'N/A') {
    addText(invoice.clientInfo.address.street, margin, y, { fontSize: 8 });
    y += 10;
  }
  if (invoice.clientInfo.address.city && invoice.clientInfo.address.city !== 'N/A') {
    const cityState = [invoice.clientInfo.address.city, invoice.clientInfo.address.state].filter(Boolean).join(', ');
    if (cityState) {
      addText(cityState, margin, y, { fontSize: 8 });
      y += 10;
    }
  }
  if (invoice.clientInfo.email) {
    addText(`Email: ${invoice.clientInfo.email}`, margin, y, { fontSize: 8, color: secondaryColor });
    y += 10;
  }
  y += 5;

  // --- Items Table ---
  doc.rect(margin, y, contentWidth, 16).fillAndStroke(primaryColor, primaryColor);
  addText('Description', margin + 8, y + 3, { fontSize: 9, bold: true, color: 'white' });
  addText('Qty', margin + 180, y + 3, { fontSize: 9, bold: true, color: 'white', align: 'center' });
  addText('Price', margin + 200, y + 3, { fontSize: 9, bold: true, color: 'white', align: 'right' });
  addText('Tax', margin + 260, y + 3, { fontSize: 9, bold: true, color: 'white', align: 'center' });
  addText('Total', margin + 360, y + 3, { fontSize: 9, bold: true, color: 'white', align: 'right' });

  let rowCount = 0;
  invoice.items.forEach(item => {
    const rowColor = rowCount % 2 === 0 ? 'white' : '#f8fafc';
    doc.rect(margin, y, contentWidth, 14).fillAndStroke(rowColor, '#e2e8f0');
    addText(item.description, margin + 8, y + 2, { fontSize: 8 });
    addText(item.quantity.toString(), margin + 180, y + 2, { fontSize: 8, align: 'center' });
    addText(`${invoice.currencySymbol}${item.unitPrice.toFixed(2)}`, margin + 200, y + 2, { fontSize: 8, align: 'right' });
    addText(`${item.taxRate}%`, margin + 260, y + 2, { fontSize: 8, align: 'center' });
    addText(`${invoice.currencySymbol}${item.total.toFixed(2)}`, margin + 360, y + 2, { fontSize: 8, bold: true, align: 'right' });
    y += 14;
    rowCount++;
  });
  y += 8;

  // --- Totals ---
  const totalsX = margin + 250;
  let totalsY = y;
  const totalsLineSpacing = 22;
  doc.rect(totalsX - 20, totalsY - 8, 240, totalsLineSpacing * 3 + 16).fillAndStroke('#f8fafc', '#e2e8f0');
  addText('Subtotal:', totalsX, totalsY, { fontSize: 9, bold: true });
  addText(`${invoice.currencySymbol}${invoice.items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)}`, totalsX + 170, totalsY, { fontSize: 9, align: 'right' });
  addText('Tax:', totalsX, totalsY + totalsLineSpacing, { fontSize: 9 });
  addText(`${invoice.currencySymbol}${invoice.items.reduce((sum, item) => sum + item.taxAmount, 0).toFixed(2)}`, totalsX + 170, totalsY + totalsLineSpacing, { fontSize: 9, align: 'right' });
  addText('Total Amount:', totalsX, totalsY + totalsLineSpacing * 2, { fontSize: 11, bold: true, color: primaryColor });
  addText(`${invoice.currencySymbol}${invoice.totalAmount.toFixed(2)}`, totalsX + 170, totalsY + totalsLineSpacing * 2, { fontSize: 11, bold: true, color: primaryColor, align: 'right' });
  y = Math.max(y, totalsY + totalsLineSpacing * 2 + 20);

  // --- Amount in Words ---
  if (invoice.getAmountInWords) {
    addText(`Amount in words: ${invoice.getAmountInWords()}`, margin, y + 8, { fontSize: 8, color: secondaryColor });
    y += 18;
  }

  // --- Notes ---
  if (invoice.notes) {
    addText('Notes:', margin, y, { fontSize: 9, bold: true, color: primaryColor });
    addText(invoice.notes, margin + 40, y, { fontSize: 8 });
    y += 14;
  }

  // --- Payment Details ---
  if (invoice.paymentDetails && (invoice.paymentDetails.bankName || invoice.paymentDetails.accountNumber)) {
    addText('Payment Details:', margin, y, { fontSize: 9, bold: true, color: primaryColor });
    let paymentY = y + 12;
    if (invoice.paymentDetails.bankName) {
      addText(`Bank: ${invoice.paymentDetails.bankName}`, margin, paymentY, { fontSize: 8 });
      paymentY += 10;
    }
    if (invoice.paymentDetails.accountNumber) {
      addText(`Account: ${invoice.paymentDetails.accountNumber}`, margin, paymentY, { fontSize: 8 });
      paymentY += 10;
    }
    if (invoice.paymentDetails.ifscCode) {
      addText(`IFSC: ${invoice.paymentDetails.ifscCode}`, margin, paymentY, { fontSize: 8 });
      paymentY += 10;
    }
    y = paymentY;
  }

  // --- Footer ---
  if (y < doc.page.height - 50) {
    addText('Thank you for your business!', margin, y + 10, { fontSize: 10, color: secondaryColor, align: 'center', width: contentWidth });
  }
}