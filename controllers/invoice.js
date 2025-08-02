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

    // Recalculate totals from items for data integrity
    if (req.body.items && req.body.items.length > 0) {
      let subtotal = 0;
      let totalAmount = 0;
      req.body.items.forEach(item => {
        const itemSubtotal = item.quantity * item.unitPrice;
        const itemTax = (itemSubtotal * item.taxRate) / 100;
        item.subtotal = itemSubtotal;
        item.total = itemSubtotal + itemTax;
        
        subtotal += itemSubtotal;
        totalAmount += item.total;
      });
      req.body.subtotal = subtotal;
      req.body.totalAmount = totalAmount;
      req.body.balanceDue = totalAmount;
      req.body.amountPaid = 0;
    }

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
    
    // Recalculate totals from items for data integrity
    if (req.body.items && req.body.items.length > 0) {
      let subtotal = 0;
      let totalAmount = 0;
      req.body.items.forEach(item => {
        const itemSubtotal = item.quantity * item.unitPrice;
        const itemTax = (itemSubtotal * item.taxRate) / 100;
        item.subtotal = itemSubtotal;
        item.total = itemSubtotal + itemTax;
        
        subtotal += itemSubtotal;
        totalAmount += item.total;
      });
      req.body.subtotal = subtotal;
      req.body.totalAmount = totalAmount;
      req.body.balanceDue = totalAmount - invoice.amountPaid; // Update balance due
    }

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

    // Create PDF document with proper A4 settings
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      autoFirstPage: true
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

    // Create PDF document with proper A4 settings
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      autoFirstPage: true
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

// @desc    Send invoice to customer
// @route   POST /api/invoices/:id/send
// @access  Private (Admin, Manager, Sales Person)
exports.sendToCustomer = async (req, res) => {
  try {
    console.log('============= SEND INVOICE TO CUSTOMER =============');
    console.log('Invoice ID:', req.params.id);
    console.log('User making request:', {
      id: req.user._id,
      role: req.user.role,
      name: req.user.fullName
    });

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice || invoice.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check if user has permission to send this invoice
    if (req.user.role === 'Sales Person' && invoice.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send this invoice'
      });
    }

    // Update invoice status to 'Sent'
    invoice.status = 'Sent';
    invoice.updatedBy = req.user._id;
    await invoice.save();

    // TODO: Implement actual email sending functionality
    // For now, just return success
    console.log('Invoice sent to customer:', invoice.invoiceNumber);

    res.status(200).json({
      success: true,
      message: 'Invoice sent to customer successfully',
      data: {
        invoiceNumber: invoice.invoiceNumber,
        customerEmail: invoice.clientInfo.email,
        status: invoice.status
      }
    });

  } catch (err) {
    console.error('Error sending invoice to customer:', err);
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

// Helper function to generate PDF content with corrected alignment and calculations
function generatePDFContent(doc, invoice) {
  const pageWidth = doc.page.width;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  let y = doc.y;
  const lineSpacing = 16;
  const smallLineSpacing = 12;

  // Colors and Fonts
  const primaryColor = '#2563eb';
  const secondaryColor = '#64748b';
  const textColor = '#1e293b';
  const lightGray = '#f8fafc';
  const boldFont = 'Helvetica-Bold';
  const regularFont = 'Helvetica';

  // Helper function to draw a line and advance Y
  const drawLine = () => {
    doc.strokeColor(secondaryColor).lineWidth(1).moveTo(margin, y).lineTo(pageWidth - margin, y).stroke();
    y += 15;
  };

  // --- Header Section ---
  const headerStart = y;
  const companyInfoWidth = 280;
  const logoWidth = 80;
  const logoHeight = 60;
  const logoPath = path.join(__dirname, '../assets/images/traincape-logo.jpg');

  // Draw logo on the left
  try {
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, margin, y, { width: logoWidth, height: logoHeight });
    }
  } catch (error) {
    // Logo not found, continue without it
  }
  
  // Company Info on the right
  const companyX = pageWidth - margin - companyInfoWidth;
  doc.fontSize(18).fillColor(primaryColor).font(boldFont).text('TRAINCAPE TECHNOLOGY', companyX, headerStart, { width: companyInfoWidth, align: 'right' });
  doc.fontSize(11).fillColor(textColor).font(regularFont).text('Khandolia Plaza, 118C, Dabri - Palam Rd', companyX, doc.y, { width: companyInfoWidth, align: 'right' });
  doc.text('Vaishali, Vaishali Colony, Dashrath Puri', companyX, doc.y, { width: companyInfoWidth, align: 'right' });
  doc.text('New Delhi, Delhi', companyX, doc.y, { width: companyInfoWidth, align: 'right' });
  doc.text(`Email: sales@traincapetech.in`, companyX, doc.y, { width: companyInfoWidth, align: 'right', link: 'mailto:sales@traincapetech.in' });
  doc.text(`Phone: +44 1253 928501`, companyX, doc.y, { width: companyInfoWidth, align: 'right' });
  
  y = Math.max(doc.y, headerStart + logoHeight + 20);

  // --- Invoice Details & Bill To Section ---
  doc.fontSize(28).fillColor(primaryColor).font(boldFont).text('INVOICE', margin, y);
  const invoiceTitleY = y;
  y = doc.y + 20;

  const billToX = margin;
  const detailsLabelX = pageWidth - 200;
  const detailsValueX = pageWidth - margin;
  const detailsColWidth = detailsValueX - detailsLabelX;
  
  doc.fontSize(16).fillColor(primaryColor).font(boldFont).text('BILL TO:', billToX, y);
  const billToY = doc.y;
  
  doc.fontSize(13).fillColor(textColor).font(boldFont).text(invoice.clientInfo.name, billToX, billToY + lineSpacing);
  let currentY = doc.y + smallLineSpacing;
  
  if (invoice.clientInfo.company) {
    doc.fontSize(12).font(regularFont).text(invoice.clientInfo.company, billToX, currentY);
    currentY = doc.y;
  }
  if (invoice.clientInfo.address.street && invoice.clientInfo.address.street !== 'N/A') {
    doc.fontSize(12).font(regularFont).text(invoice.clientInfo.address.street, billToX, currentY);
    currentY = doc.y;
  }
  if (invoice.clientInfo.address.city && invoice.clientInfo.address.city !== 'N/A') {
    const cityState = [invoice.clientInfo.address.city, invoice.clientInfo.address.state].filter(Boolean).join(', ');
    if (cityState) {
      doc.fontSize(12).font(regularFont).text(cityState, billToX, currentY);
      currentY = doc.y;
    }
  }
  if (invoice.clientInfo.email) {
    doc.fontSize(12).font(regularFont).text(`Email: ${invoice.clientInfo.email}`, billToX, currentY);
    currentY = doc.y;
  }
  
  // Invoice Details
  const detailsY = invoiceTitleY;
  doc.fontSize(12).fillColor(textColor).font(boldFont).text('Invoice #:', detailsLabelX, detailsY);
  doc.font(regularFont).text(invoice.invoiceNumber, detailsLabelX, detailsY, { width: detailsColWidth, align: 'right' });

  doc.font(boldFont).text('Date:', detailsLabelX, detailsY + lineSpacing);
  doc.font(regularFont).text(new Date(invoice.invoiceDate).toLocaleDateString(), detailsLabelX, detailsY + lineSpacing, { width: detailsColWidth, align: 'right' });

  doc.font(boldFont).text('Status:', detailsLabelX, detailsY + lineSpacing * 2);
  doc.font(regularFont).text(invoice.status, detailsLabelX, detailsY + lineSpacing * 2, { width: detailsColWidth, align: 'right' });
  
  y = Math.max(currentY, detailsY + lineSpacing * 2) + 20;
  
  drawLine();

  // --- Items Table ---
  y += 10;
  const tableTop = y;
  const tableRowHeight = 25;
  const colPadding = 5;

  // Define dynamic column widths
  const descriptionColWidth = contentWidth * 0.45;
  const qtyColWidth = contentWidth * 0.1;
  const priceColWidth = contentWidth * 0.15;
  const taxColWidth = contentWidth * 0.15;
  const totalColWidth = contentWidth - descriptionColWidth - qtyColWidth - priceColWidth - taxColWidth;

  // Define column x-coordinates
  const col1X = margin;
  const col2X = col1X + descriptionColWidth;
  const col3X = col2X + qtyColWidth;
  const col4X = col3X + priceColWidth;
  const col5X = col4X + taxColWidth;

  // Table Header
  doc.rect(margin, tableTop, contentWidth, tableRowHeight).fill(primaryColor);
  y = tableTop + 8;
  doc.fontSize(11).fillColor('white').font(boldFont).text('Description', col1X + colPadding, y);
  doc.text('Qty', col2X, y, { width: qtyColWidth, align: 'center' });
  doc.text('Unit Price', col3X, y, { width: priceColWidth, align: 'center' });
  doc.text('Tax %', col4X, y, { width: taxColWidth, align: 'center' });
  doc.text('Total', col5X, y, { width: totalColWidth - colPadding, align: 'right' });
  y = tableTop + tableRowHeight;

  // Table Rows
  doc.fillColor(textColor).font(regularFont);
  invoice.items.forEach((item, index) => {
    const rowY = y;
    const backgroundColor = index % 2 === 0 ? 'white' : lightGray;
    doc.rect(margin, rowY, contentWidth, tableRowHeight).fill(backgroundColor);
    
    doc.fillColor(textColor).text(item.description, col1X + colPadding, rowY + 8, { width: descriptionColWidth - colPadding });
    doc.text(item.quantity.toString(), col2X, rowY + 8, { width: qtyColWidth, align: 'center' });
    doc.text(`${item.unitPrice.toFixed(2)}`, col3X, rowY + 8, { width: priceColWidth, align: 'center' });
    doc.text(`${item.taxRate}%`, col4X, rowY + 8, { width: taxColWidth, align: 'center' });
    doc.text(`${item.total.toFixed(2)}`, col5X, rowY + 8, { width: totalColWidth - colPadding, align: 'right' });
    
    y += tableRowHeight;
  });
  y += 25;

  // --- Totals Section ---
  const totalsX = pageWidth - margin - 220;
  const totalsY = y;
  const totalValueX = pageWidth - margin - 110;
  const totalValueWidth = 110;
  
  // Recalculate totals for display to ensure accuracy, even if DB data is old
  const subtotal = invoice.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const totalTax = invoice.items.reduce((sum, item) => sum + ((item.quantity * item.unitPrice) * item.taxRate / 100), 0);
  const totalAmount = subtotal + totalTax;
  
  doc.fontSize(12).font(boldFont).text('Subtotal:', totalsX, totalsY);
  doc.font(regularFont).text(`${subtotal.toFixed(2)}`, totalValueX, totalsY, { width: totalValueWidth, align: 'right' });
  
  const taxY = totalsY + 18;
  doc.font(boldFont).text('Tax:', totalsX, taxY);
  doc.font(regularFont).text(`${totalTax.toFixed(2)}`, totalValueX, taxY, { width: totalValueWidth, align: 'right' });
  
  const totalY = taxY + 25;
  doc.rect(totalsX, totalY, 220, 25).fill(lightGray);
  doc.fontSize(14).font(boldFont).fillColor(primaryColor).text('Total Amount:', totalsX + colPadding, totalY + 5);
  doc.text(`${totalAmount.toFixed(2)}`, totalValueX, totalY + 5, { width: totalValueWidth, align: 'right' });
  y = totalY + 30;

  // --- Other Information ---
  if (typeof invoice.getAmountInWords === 'function') {
    doc.fillColor(textColor).font(regularFont).text(`Amount in words: ${invoice.getAmountInWords()}`, margin, y);
    y = doc.y + 15;
  }
  
  if (invoice.notes) {
    doc.font(boldFont).fillColor(primaryColor).text('Notes:', margin, y);
    doc.font(regularFont).fillColor(textColor).text(invoice.notes, margin + 60, y, { width: contentWidth - 60 });
    y = doc.y + 20;
  }
  
  // --- Footer ---
  const footerY = doc.page.height - 30;
  doc.fontSize(11).fillColor(secondaryColor).font(regularFont).text('Thank you for your business!', 0, footerY, { align: 'center' });
}