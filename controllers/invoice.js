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
      query = query.where('createdBy').equals(req.user._id);
    } else if (req.user.role === 'Manager' || req.user.role === 'Admin') {
      // Manager and Admin can see all invoices
    } else {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access invoices'
      });
    }

    // Apply filters from query parameters
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
    const total = await Invoice.countDocuments(query.getFilter());
    query = query.skip(startIndex).limit(limit);

    const invoices = await query;
    const endIndex = startIndex + invoices.length;
    
    // Pagination result
    const pagination = {};
    if (endIndex < total) {
      pagination.next = { page: page + 1, limit };
    }
    if (startIndex > 0) {
      pagination.prev = { page: page - 1, limit };
    }

    res.status(200).json({
      success: true,
      count: invoices.length,
      pagination,
      data: invoices
    });
  } catch (err) {
    console.error('Error fetching invoices:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
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
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    if (req.user.role === 'Sales Person' && invoice.createdBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this invoice' });
    }

    res.status(200).json({ success: true, data: invoice });
  } catch (err) {
    console.error('Error fetching invoice:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Private (Admin, Manager, Sales Person)
exports.createInvoice = async (req, res) => {
  try {
    const currentDate = new Date();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const lastInvoice = await Invoice.findOne().sort({ createdAt: -1 });
    let counter = 1;
    if (lastInvoice) {
      const lastInvNum = lastInvoice.invoiceNumber.split('-');
      if (lastInvNum.length === 3 && lastInvNum[1] === month) {
        counter = parseInt(lastInvNum[2], 10) + 1;
      }
    }
    const invoiceNumber = `INV-${month}-${counter.toString().padStart(4, '0')}`;
    
    req.body.createdBy = req.user._id;
    req.body.invoiceNumber = invoiceNumber;

    if (req.body.items && req.body.items.length > 0) {
      let subtotal = 0;
      req.body.items.forEach(item => {
        subtotal += item.quantity * item.unitPrice;
      });
      const totalTax = subtotal * (req.body.items[0].taxRate / 100);
      req.body.subtotal = subtotal;
      req.body.totalAmount = subtotal + totalTax;
      req.body.balanceDue = req.body.totalAmount;
      req.body.amountPaid = 0;
    }

    if (req.body.paymentTerms && req.body.paymentTerms !== 'Due on Receipt') {
      const days = parseInt(req.body.paymentTerms.split(' ')[1]) || 30;
      req.body.dueDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    } else {
        req.body.dueDate = new Date();
    }
    
    if (!req.body.relatedSale) delete req.body.relatedSale;
    if (!req.body.relatedLead) delete req.body.relatedLead;

    const invoice = await Invoice.create(req.body);
    const populatedInvoice = await Invoice.findById(invoice._id)
      .populate('createdBy', 'fullName email')
      .populate('relatedSale', 'customerName course totalCost')
      .populate('relatedLead', 'name course');

    res.status(201).json({ success: true, data: populatedInvoice });
  } catch (err) {
    console.error('Error creating invoice:', err);
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Update invoice
// @route   PUT /api/invoices/:id
// @access  Private (Admin, Manager, Sales Person)
exports.updateInvoice = async (req, res) => {
  try {
    let invoice = await Invoice.findById(req.params.id);
    if (!invoice || invoice.isDeleted) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    if (req.user.role === 'Sales Person' && invoice.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this invoice' });
    }

    req.body.updatedBy = req.user._id;
    
    if (req.body.items && req.body.items.length > 0) {
      let subtotal = 0;
      req.body.items.forEach(item => {
        subtotal += item.quantity * item.unitPrice;
      });
      const totalTax = subtotal * (req.body.items[0].taxRate / 100);
      req.body.subtotal = subtotal;
      req.body.totalAmount = subtotal + totalTax;
      req.body.balanceDue = req.body.totalAmount - (invoice.amountPaid || 0);
    }

    invoice = await Invoice.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email')
      .populate('relatedSale', 'customerName course totalCost')
      .populate('relatedLead', 'name course');

    res.status(200).json({ success: true, data: invoice });
  } catch (err) {
    console.error('Error updating invoice:', err);
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Delete invoice (soft delete)
// @route   DELETE /api/invoices/:id
// @access  Private (Admin, Manager)
exports.deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice || invoice.isDeleted) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    if (!['Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete invoices' });
    }

    invoice.isDeleted = true;
    invoice.updatedBy = req.user._id;
    await invoice.save();

    res.status(200).json({ success: true, message: 'Invoice deleted successfully' });
  } catch (err) {
      console.error('Error deleting invoice:', err);
      res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Generate PDF invoice
// @route   GET /api/invoices/:id/pdf
// @access  Private (Admin, Manager, Sales Person)
exports.generatePDF = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('createdBy', 'fullName email');

        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }
        
        if (req.user.role === 'Sales Person' && invoice.createdBy._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to access this invoice' });
        }
        
        const doc = new PDFDocument({ size: 'A4', margin: 0 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Invoice-${invoice.invoiceNumber}.pdf"`);

        doc.pipe(res);
        
        // This is the updated function
        generateExactPDFContent(doc, invoice);

        doc.end();
  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({ success: false, message: 'Error generating PDF' });
  }
};

// @desc    Download PDF invoice
// @route   GET /api/invoices/:id/download
// @access  Private (Admin, Manager, Sales Person)
exports.downloadPDF = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('createdBy', 'fullName email');

        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }

        if (req.user.role === 'Sales Person' && invoice.createdBy._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to access this invoice' });
        }

        const doc = new PDFDocument({ size: 'A4', margin: 0 });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`);

        doc.pipe(res);
        
        // This is the updated function
        generateExactPDFContent(doc, invoice);

        doc.end();
  } catch (err) {
    console.error('Error downloading PDF:', err);
    res.status(500).json({ success: false, message: 'Error downloading PDF' });
  }
};


// @desc    Record payment
// @route   POST /api/invoices/:id/payment
// @access  Private (Admin, Manager, Sales Person)
exports.recordPayment = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice || invoice.isDeleted) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    if (req.user.role === 'Sales Person' && invoice.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to record payment' });
    }

    const { amount, method, reference, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than 0' });
    }

    invoice.payments.push({
      date: new Date(),
      amount: parseFloat(amount),
      method,
      reference,
      notes,
      recordedBy: req.user._id
    });

    invoice.amountPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    invoice.balanceDue = invoice.totalAmount - invoice.amountPaid;
    invoice.status = invoice.balanceDue <= 0 ? 'Paid' : 'Partially Paid';
    invoice.updatedBy = req.user._id;

    await invoice.save();
    
    const updatedInvoice = await Invoice.findById(invoice._id).populate('payments.recordedBy', 'fullName');

    res.status(200).json({ success: true, data: updatedInvoice });
  } catch (err) {
    console.error('Error recording payment:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};


// @desc    Send invoice to customer
// @route   POST /api/invoices/:id/send
// @access  Private (Admin, Manager, Sales Person)
exports.sendToCustomer = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice || invoice.isDeleted) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    if (req.user.role === 'Sales Person' && invoice.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to send this invoice' });
    }

    invoice.status = 'Sent';
    invoice.updatedBy = req.user._id;
    await invoice.save();

    // TODO: Implement actual email sending functionality here

    res.status(200).json({
      success: true,
      message: 'Invoice status updated to Sent.',
      data: {
        invoiceNumber: invoice.invoiceNumber,
        customerEmail: invoice.clientInfo.email,
        status: invoice.status
      }
    });
  } catch (err) {
    console.error('Error sending invoice:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Get invoice statistics
// @route   GET /api/invoices/stats
// @access  Private (Admin, Manager)
exports.getInvoiceStats = async (req, res) => {
    try {
        if (!['Admin', 'Manager'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const { startDate, endDate } = req.query;
        let dateFilter = { isDeleted: false };
        if (startDate && endDate) {
            dateFilter.invoiceDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        const totalInvoices = await Invoice.countDocuments(dateFilter);

        const statusStats = await Invoice.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } }
        ]);

        const revenue = await Invoice.aggregate([
            { $match: { ...dateFilter, status: 'Paid' } },
            { $group: { _id: null, paid: { $sum: '$amountPaid' } } }
        ]);

        const outstanding = await Invoice.aggregate([
            { $match: { ...dateFilter, status: { $in: ['Sent', 'Partially Paid'] } } },
            { $group: { _id: null, due: { $sum: '$balanceDue' } } }
        ]);

        const stats = {
            totalInvoices,
            statusBreakdown: statusStats.reduce((acc, stat) => {
                acc[stat._id] = { count: stat.count, totalAmount: stat.total };
                return acc;
            }, {}),
            totalRevenue: revenue[0]?.paid || 0,
            outstandingAmount: outstanding[0]?.due || 0
        };

        res.status(200).json({ success: true, data: stats });
    } catch (err) {
        console.error('Error getting invoice stats:', err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// =================================================================================================
//          PDF GENERATION FUNCTION - DITTO REPLICA of Gaurav Arora invoice.pdf
// =================================================================================================
function generateExactPDFContent(doc, invoice) {
    // Colors
    const colorDarkBlue = '#0d111d'; // Corrected background color to a dark blue
    const colorWhite = '#ffffff';
    const colorBlue = '#3c91e6';
    const colorDarkGrey = '#333333';
    const colorLightGrey = '#e5e7eb';
    const blockBgColor = '#f0edf9'; // New background color for the blocks
    const colorTraincape = '#6539c0';
    
    // Set background
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(colorWhite);

    // Header
    const logoPath = path.join(__dirname, '../assets/images/traincape-logo.jpg'); // Fixed path
    console.log('Logo path:', logoPath); 
    if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 450, 65, { width: 60 });
        console.log('Logo loaded successfully');
    } else {
        console.log('Logo not found at path:', logoPath);
    }
    
    doc.font('Helvetica-Bold').fontSize(26).fillColor(colorTraincape).text('GST Invoice', 40, 58);
    // doc.font('Helvetica').fontSize(9).text('TECHNOLOGY', 107, 83, { characterSpacing: 1 });

    // GST Invoice Title
    // doc.font('Helvetica-Bold').fontSize(16).fillColor(colorBlue).text('GST Invoice', 450, 65, { align: 'left' });

    // Invoice Info (Left)
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(colorDarkBlue).text('Invoice No:',40,110)
       .font('Helvetica').text(invoice.invoiceNumber, 110, 110)
       .font('Helvetica-Bold').text('Invoice Date:', 40, 125)
       .font('Helvetica').text(new Date(invoice.invoiceDate).toLocaleDateString('en-GB'), 110, 125);

    // Company Info Block
    const companyBlockX = 40;
    const companyBlockY = 140;
    const companyBlockWidth = 280;
    const companyBlockHeight = 110;
    doc.rect(companyBlockX, companyBlockY, companyBlockWidth, companyBlockHeight).fill(blockBgColor);
    
    // Set color for this specific line
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(colorTraincape).text('Traincape Technology Pvt. Ltd.', companyBlockX + 10, companyBlockY + 10);
    
    // Reset color for remaining text in the block
    doc.fillColor(colorDarkGrey);
    doc.font('Helvetica').fontSize(9.5).text('Rz-118C, Khandoliya Plaza, 4th Floor, Dabri-Palam Road,', companyBlockX + 10, companyBlockY + 25)
       .text('New Delhi, Delhi, India-110045', companyBlockX + 10, companyBlockY + 37)
       .moveDown(0.5)
       .text(`GSTIN: ${invoice.companyInfo?.gstin || '07AAJCT0342G1ZJ'}`, companyBlockX + 10, companyBlockY + 52)
       .text(`PAN: ${invoice.companyInfo?.pan || 'AAJCT0342G'}`, companyBlockX + 10, companyBlockY + 64)
       .moveDown(0.5)
       .text(`Email: ${invoice.companyInfo?.email || 'sales@traincapetech.info'}`, companyBlockX + 10, companyBlockY + 79)
       .text(`Phone: ${invoice.companyInfo?.phone || '+91 62802 81505'}`, companyBlockX + 10, companyBlockY + 91);
    // Billed To Block
    const billedToBlockX = 350;
    const billedToBlockY = 140;
    const billedToBlockWidth = 220;
    const billedToBlockHeight = 75;
    doc.rect(billedToBlockX, billedToBlockY, billedToBlockWidth, billedToBlockHeight).fill(blockBgColor);
    
    doc.font('Helvetica-Bold').fillColor(colorDarkGrey).text('Billed To', billedToBlockX + 10, billedToBlockY + 10)
       .font('Helvetica').text(invoice.clientInfo.name, billedToBlockX + 10, billedToBlockY + 25)
       .text(invoice.clientInfo.address.street, billedToBlockX + 10, billedToBlockY + 37)
       .text(`${invoice.clientInfo.address.city || ''} ${invoice.clientInfo.address.state || ''} ${invoice.clientInfo.address.zip || ''}`, billedToBlockX + 10, billedToBlockY + 49);

    // White background for table and totals
    doc.rect(25, 270, doc.page.width - 50, 300).fill(colorWhite);

    // Table Header
    const tableTop = 285;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colorDarkGrey);
    doc.text('DESCRIPTION', 40, tableTop, { width: 180 });
    doc.text('QTY', 245, tableTop, { width: 50, align: 'right' });
    doc.text('UNIT PRICE', 320, tableTop, { width: 80, align: 'right' });
    doc.text('GST', 425, tableTop, { width: 50, align: 'right' });
    doc.text('TOTAL', 495, tableTop, { width: 70, align: 'right' });
    doc.moveTo(35, tableTop + 15).lineTo(doc.page.width - 35, tableTop + 15).stroke(colorLightGrey);

    // Table Rows
    let itemY = tableTop + 25;
    doc.font('Helvetica').fontSize(9).fillColor(colorDarkGrey);
    invoice.items.forEach(item => {
        const itemGst = item.quantity * item.unitPrice * (item.taxRate / 100);
        const itemTotal = (item.quantity * item.unitPrice) + itemGst;

        doc.text(item.description, 40, itemY, { width: 180 });
        doc.text(item.quantity.toString(), 245, itemY, { width: 50, align: 'right' });
        doc.text(item.unitPrice.toFixed(2), 320, itemY, { width: 80, align: 'right' });
        doc.text(itemGst.toFixed(2), 425, itemY, { width: 50, align: 'right' });
        doc.text(itemTotal.toFixed(2), 495, itemY, { width: 70, align: 'right' });
        itemY += 20;
    });

    // Totals Section
    // Totals Section
    const totalsY = 450;
    const totalsLeftX = 450; // New X-coordinate for left-aligned text
    const totalsRightX = 550; // New X-coordinate for right-aligned text
    const totalsWidth = 100; // Width for the text to align within

    const subtotal = invoice.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const totalGst = invoice.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice * (item.taxRate / 100)), 0);
    const gstRate = invoice.items.length > 0 ? invoice.items[0].taxRate : 18;

    doc.font('Helvetica-Bold').fontSize(9).fillColor(colorDarkGrey);
    doc.text('SUBTOTAL', totalsLeftX - 100, totalsY, {width: totalsWidth, align: 'left'});
    doc.text(subtotal.toFixed(2), totalsRightX - 100, totalsY, { width: totalsWidth, align: 'right'});
    doc.text(`GST ${gstRate}%`, totalsLeftX - 100, totalsY + 15, {width: totalsWidth, align: 'left'});
    doc.text(totalGst.toFixed(2), totalsRightX - 100, totalsY + 15, { width: totalsWidth, align: 'right'});
    
    doc.moveTo(totalsLeftX - 110, totalsY + 35).lineTo(totalsRightX + 10, totalsY + 35).stroke(colorDarkGrey);
    
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('TOTAL', totalsLeftX - 100, totalsY + 45, {width: totalsWidth, align: 'left'});
    doc.text(`₹${invoice.totalAmount.toFixed(2)}`, totalsRightX - 100, totalsY + 45, { width: totalsWidth, align: 'right'});
    
    // Footer - Authorised Signatory with image and address
    const signatureImageY = 550; // Adjusted Y-coordinate to give more space
    const signatoryTextY = signatureImageY + 50; // Place "Authorised Signatory" below the image with a small gap
    const signatoryAddressY = signatoryTextY + 15;

    // Signature image
    const signaturePath = path.join(__dirname, '../assets/images/Signature.jpg'); // Placeholder, replace with your actual file name and path
    if (fs.existsSync(signaturePath)) {
      doc.image(signaturePath, totalsRightX - 100, signatureImageY, { width: 100 });
    } else {
      console.log('Signature image not found at path:', signaturePath);
    }
    
    // Authorised Signatory
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(colorDarkGrey);
    doc.text('Authorised Signatory', totalsRightX - 100, signatoryTextY, {align: 'center', width: 100});

    // Authorised Signatory address
    doc.font('Helvetica').fontSize(9.5).fillColor(colorDarkGrey);
    doc.text('Traincape Technology Pvt. Ltd.', totalsRightX - 100, signatoryAddressY, {align: 'center', width: 100});
}