// Initialize Stripe with error handling for missing API key
let stripe;
try {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('⚠️ STRIPE_SECRET_KEY not found in environment variables');
    stripe = null;
  } else {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
} catch (error) {
  console.error('❌ Error initializing Stripe:', error.message);
  stripe = null;
}

const mongoose = require('mongoose');
const StripeInvoice = require('../models/StripeInvoice');
const Invoice = require('../models/Invoice');
const User = require('../models/User');

// Create Stripe customer
const createStripeCustomer = async (customerData) => {
  try {
    if (!stripe) {
      throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
    }
    
    const customer = await stripe.customers.create({
      email: customerData.email,
      name: customerData.name,
      metadata: {
        crmCustomerId: customerData.crmId || '',
        company: customerData.company || ''
      }
    });
    return customer;
  } catch (error) {
    console.error('Error creating Stripe customer:', error);
    throw error;
  }
};

// Create Stripe product and price
const createStripeProduct = async (productData) => {
  try {
    if (!stripe) {
      throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
    }
    
    const product = await stripe.products.create({
      name: productData.name,
      description: productData.description
    });

    const price = await stripe.prices.create({
      unit_amount: Math.round(productData.unitAmount * 100), // Convert to cents
      currency: productData.currency || 'usd',
      product: product.id
    });

    return { product, price };
  } catch (error) {
    console.error('Error creating Stripe product:', error);
    throw error;
  }
};

// Create Stripe invoice
const createStripeInvoice = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ 
        message: 'Stripe payment processing is currently unavailable. Please contact support.' 
      });
    }
    
    const { crmInvoiceId, customerData, items, dueDate } = req.body;
    const userId = req.user.id;

    // Get CRM invoice for reference
    const crmInvoice = await Invoice.findById(crmInvoiceId);
    if (!crmInvoice) {
      return res.status(404).json({ message: 'CRM Invoice not found' });
    }

    // Create or get Stripe customer
    let stripeCustomer;
    try {
      stripeCustomer = await stripe.customers.list({
        email: customerData.email,
        limit: 1
      });
      
      if (stripeCustomer.data.length === 0) {
        stripeCustomer = await createStripeCustomer(customerData);
      } else {
        stripeCustomer = stripeCustomer.data[0];
      }
    } catch (error) {
      return res.status(400).json({ message: 'Error with customer data' });
    }

    // Create invoice items
    const invoiceItems = [];
    for (const item of items) {
      // Create product for each item
      const { product, price } = await createStripeProduct({
        name: item.description,
        description: item.description,
        unitAmount: item.unitPrice,
        currency: crmInvoice.currency
      });

      // Add invoice item
      await stripe.invoiceItems.create({
        customer: stripeCustomer.id,
        price: price.id,
        quantity: item.quantity,
        metadata: {
          crmItemId: item._id || '',
          taxRate: item.taxRate || 0
        }
      });

      invoiceItems.push({ product, price });
    }

    // Create Stripe invoice
    const stripeInvoice = await stripe.invoices.create({
      customer: stripeCustomer.id,
      collection_method: 'send_invoice',
      days_until_due: dueDate ? Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24)) : 30,
      metadata: {
        crmInvoiceId: crmInvoiceId,
        createdBy: userId
      }
    });

    // Save to our database
    const stripeInvoiceRecord = await StripeInvoice.create({
      stripeInvoiceId: stripeInvoice.id,
      stripeCustomerId: stripeCustomer.id,
      customerEmail: customerData.email,
      customerName: customerData.name,
      amount: crmInvoice.totalAmount,
      currency: crmInvoice.currency,
      status: stripeInvoice.status,
      dueDate: dueDate ? new Date(dueDate) : null,
      stripeInvoiceUrl: stripeInvoice.hosted_invoice_url,
      stripeInvoicePdf: stripeInvoice.invoice_pdf,
      createdBy: userId,
      companyId: req.user.companyId || req.user.id,
      crmInvoiceId: crmInvoiceId
    });

    // Send the invoice
    const sentInvoice = await stripe.invoices.sendInvoice(stripeInvoice.id);

    res.status(201).json({
      message: 'Stripe invoice created and sent successfully',
      stripeInvoice: stripeInvoiceRecord,
      hostedUrl: sentInvoice.hosted_invoice_url,
      pdfUrl: sentInvoice.invoice_pdf
    });

  } catch (error) {
    console.error('Error creating Stripe invoice:', error);
    res.status(500).json({ message: 'Error creating Stripe invoice', error: error.message });
  }
};

// Get all Stripe invoices
const getStripeInvoices = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, customerEmail } = req.query;
    const userId = req.user.id;

    let query = { createdBy: userId };
    
    if (status) query.status = status;
    if (customerEmail) query.customerEmail = { $regex: customerEmail, $options: 'i' };

    const invoices = await StripeInvoice.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('crmInvoiceId', 'invoiceNumber companyInfo clientInfo')
      .populate('createdBy', 'name email');

    const total = await StripeInvoice.countDocuments(query);

    res.json({
      invoices,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Error fetching Stripe invoices:', error);
    res.status(500).json({ message: 'Error fetching Stripe invoices' });
  }
};

// Get single Stripe invoice
const getStripeInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const invoice = await StripeInvoice.findOne({ 
      _id: id, 
      createdBy: userId 
    }).populate('crmInvoiceId createdBy');

    if (!invoice) {
      return res.status(404).json({ message: 'Stripe invoice not found' });
    }

    // Get latest data from Stripe
    if (stripe) {
      try {
        const stripeData = await stripe.invoices.retrieve(invoice.stripeInvoiceId);
        invoice.status = stripeData.status;
        invoice.paidAt = stripeData.status === 'paid' ? new Date(stripeData.status_transitions.paid_at * 1000) : null;
        await invoice.save();
      } catch (stripeError) {
        console.error('Error fetching from Stripe:', stripeError);
      }
    } else {
      console.warn('Stripe not configured - using cached invoice data');
    }

    res.json(invoice);

  } catch (error) {
    console.error('Error fetching Stripe invoice:', error);
    res.status(500).json({ message: 'Error fetching Stripe invoice' });
  }
};

// Webhook handler for Stripe events
const handleStripeWebhook = async (req, res) => {
  if (!stripe) {
    console.warn('Stripe webhook received but Stripe is not configured');
    return res.status(503).json({ message: 'Stripe is not configured' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, 
      sig, 
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      
      case 'invoice.finalized':
        await handleInvoiceFinalized(event.data.object);
        break;
      
      case 'invoice.voided':
        await handleInvoiceVoided(event.data.object);
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Webhook event handlers
const handlePaymentSucceeded = async (invoice) => {
  await StripeInvoice.findOneAndUpdate(
    { stripeInvoiceId: invoice.id },
    { 
      status: invoice.status,
      paidAt: new Date(invoice.status_transitions.paid_at * 1000)
    }
  );
  console.log(`Payment succeeded for invoice: ${invoice.id}`);
};

const handlePaymentFailed = async (invoice) => {
  await StripeInvoice.findOneAndUpdate(
    { stripeInvoiceId: invoice.id },
    { status: invoice.status }
  );
  console.log(`Payment failed for invoice: ${invoice.id}`);
};

const handleInvoiceFinalized = async (invoice) => {
  await StripeInvoice.findOneAndUpdate(
    { stripeInvoiceId: invoice.id },
    { 
      status: invoice.status,
      stripeInvoiceUrl: invoice.hosted_invoice_url,
      stripeInvoicePdf: invoice.invoice_pdf
    }
  );
  console.log(`Invoice finalized: ${invoice.id}`);
};

const handleInvoiceVoided = async (invoice) => {
  await StripeInvoice.findOneAndUpdate(
    { stripeInvoiceId: invoice.id },
    { status: invoice.status }
  );
  console.log(`Invoice voided: ${invoice.id}`);
};

// Send invoice reminder
const sendInvoiceReminder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const invoice = await StripeInvoice.findOne({ 
      _id: id, 
      createdBy: userId 
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Stripe invoice not found' });
    }

    // Send reminder via Stripe
    await stripe.invoices.sendInvoice(invoice.stripeInvoiceId);

    res.json({ message: 'Invoice reminder sent successfully' });

  } catch (error) {
    console.error('Error sending invoice reminder:', error);
    res.status(500).json({ message: 'Error sending invoice reminder' });
  }
};

// Get Stripe invoice statistics
const getStripeInvoiceStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await StripeInvoice.aggregate([
      { $match: { createdBy: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const totalInvoices = await StripeInvoice.countDocuments({ createdBy: userId });
    const totalAmount = await StripeInvoice.aggregate([
      { $match: { createdBy: mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      stats,
      totalInvoices,
      totalAmount: totalAmount[0]?.total || 0
    });

  } catch (error) {
    console.error('Error fetching Stripe invoice stats:', error);
    res.status(500).json({ message: 'Error fetching invoice statistics' });
  }
};

module.exports = {
  createStripeInvoice,
  getStripeInvoices,
  getStripeInvoice,
  handleStripeWebhook,
  sendInvoiceReminder,
  getStripeInvoiceStats
}; 