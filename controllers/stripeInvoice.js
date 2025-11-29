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

// Currency conversion for Stripe compatibility
const getStripeCurrency = (currency) => {
  const currencyMap = {
    'INR': 'inr',
    'USD': 'usd',
    'EUR': 'eur',
    'GBP': 'gbp',
    'CAD': 'cad',
    'AUD': 'aud',
    'JPY': 'jpy',
    'SGD': 'sgd',
    'HKD': 'hkd',
    'CHF': 'chf',
    'SEK': 'sek',
    'NOK': 'nok',
    'DKK': 'dkk',
    'PLN': 'pln',
    'CZK': 'czk',
    'HUF': 'huf',
    'RON': 'ron',
    'BGN': 'bgn',
    'HRK': 'hrk',
    'RUB': 'rub',
    'TRY': 'try',
    'BRL': 'brl',
    'MXN': 'mxn',
    'ARS': 'ars',
    'CLP': 'clp',
    'COP': 'cop',
    'PEN': 'pen',
    'UYU': 'uyu',
    'VND': 'vnd',
    'THB': 'thb',
    'MYR': 'myr',
    'IDR': 'idr',
    'PHP': 'php',
    'KRW': 'krw',
    'TWD': 'twd',
    'ILS': 'ils',
    'AED': 'aed',
    'SAR': 'sar',
    'QAR': 'qar',
    'KWD': 'kwd',
    'BHD': 'bhd',
    'OMR': 'omr',
    'JOD': 'jod',
    'LBP': 'lbp',
    'EGP': 'egp',
    'ZAR': 'zar',
    'NGN': 'ngn',
    'KES': 'kes',
    'GHS': 'ghs',
    'UGX': 'ugx',
    'TZS': 'tzs',
    'ZMW': 'zmw',
    'MAD': 'mad',
    'TND': 'tnd',
    'DZD': 'dzd',
    'LYD': 'lyd',
    'SDG': 'sdg',
    'ETB': 'etb',
    'DJF': 'djf',
    'SOS': 'sos',
    'KMF': 'kmf',
    'MUR': 'mur',
    'SCR': 'scr',
    'CVE': 'cve',
    'GMD': 'gmd',
    'GNF': 'gnf',
    'SLL': 'sll',
    'LRD': 'lrd',
    'SLE': 'sle',
    'XOF': 'xof',
    'XAF': 'xaf',
    'XPF': 'xpf',
    'CDF': 'cdf',
    'RWF': 'rwf',
    'BIF': 'bif',
    'MWK': 'mwk',
    'ZWL': 'zwl',
    'NAD': 'nad',
    'BWP': 'bwp',
    'LSL': 'lsl',
    'SZL': 'szl',
    'MZN': 'mzn',
    'MGA': 'mga',
    'BMD': 'bmd',
    'BBD': 'bbd',
    'XCD': 'xcd',
    'ANG': 'ang',
    'AWG': 'awg',
    'KYD': 'kyd',
    'JMD': 'jmd',
    'TTD': 'ttd',
    'BZD': 'bzd',
    'GYD': 'gyd',
    'SRD': 'srd',
    'HTG': 'htg',
    'DOP': 'dop',
    'CUC': 'cuc',
    'CUP': 'cup',
    'PYG': 'pyg',
    'BOB': 'bob',
    'UYU': 'uyu',
    'UYI': 'uyi',
    'GYD': 'gyd',
    'SRD': 'srd',
    'HTG': 'htg',
    'DOP': 'dop',
    'CUC': 'cuc',
    'CUP': 'cup',
    'PYG': 'pyg',
    'BOB': 'bob',
    'UYU': 'uyu',
    'UYI': 'uyi'
  };
  
  return currencyMap[currency.toUpperCase()] || 'usd'; // Default to USD if not supported
};

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
    console.log('🔍 Creating Stripe invoice with data:', req.body);
    
    if (!stripe) {
      console.error('❌ Stripe not configured');
      return res.status(503).json({ 
        message: 'Stripe payment processing is currently unavailable. Please contact support.' 
      });
    }
    
    const { crmInvoiceId, customerData, items, dueDate } = req.body;
    const userId = req.user.id;

    console.log('📋 Input data:', { crmInvoiceId, customerData, items, dueDate, userId });

    // Get CRM invoice for reference
    const crmInvoice = await Invoice.findById(crmInvoiceId);
    if (!crmInvoice) {
      console.error('❌ CRM Invoice not found:', crmInvoiceId);
      return res.status(404).json({ message: 'CRM Invoice not found' });
    }

    console.log('✅ CRM Invoice found:', crmInvoice.invoiceNumber);

    // Create or get Stripe customer
    let stripeCustomer;
    try {
      console.log('👤 Looking for existing Stripe customer:', customerData.email);
      stripeCustomer = await stripe.customers.list({
        email: customerData.email,
        limit: 1
      });
      
      if (stripeCustomer.data.length === 0) {
        console.log('👤 Creating new Stripe customer');
        stripeCustomer = await createStripeCustomer(customerData);
      } else {
        console.log('👤 Found existing Stripe customer');
        stripeCustomer = stripeCustomer.data[0];
      }
    } catch (error) {
      console.error('❌ Error with customer data:', error);
      return res.status(400).json({ message: 'Error with customer data: ' + error.message });
    }

    console.log('✅ Stripe customer ready:', stripeCustomer.id);

    // Create invoice items
    const invoiceItems = [];
    for (const item of items) {
      try {
        console.log('📦 Creating invoice item for:', item.description);
        console.log('📦 Item data:', {
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate
        });
        
        // Create product first
        const product = await stripe.products.create({
          name: item.description,
          description: item.description
        });
        
        // Add invoice item with price_data using product ID
        await stripe.invoiceItems.create({
          customer: stripeCustomer.id,
          price_data: {
            currency: getStripeCurrency(crmInvoice.currency),
            product: product.id,
            unit_amount: Math.round(item.unitPrice * 100) // Convert to cents
          },
          quantity: item.quantity,
          metadata: {
            crmItemId: item._id || '',
            taxRate: item.taxRate || 0
          }
        });

        console.log('✅ Invoice item created for:', item.description);
        invoiceItems.push({ description: item.description, quantity: item.quantity });
      } catch (itemError) {
        console.error('❌ Error creating item:', itemError);
        throw new Error(`Failed to create item "${item.description}": ${itemError.message}`);
      }
    }

    console.log('✅ All items created, creating Stripe invoice');

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

    console.log('✅ Stripe invoice created:', stripeInvoice.id);

    // Save to our database
    const stripeInvoiceRecord = await StripeInvoice.create({
      stripeInvoiceId: stripeInvoice.id,
      stripeCustomerId: stripeCustomer.id,
      customerEmail: customerData.email,
      customerName: customerData.name,
      amount: crmInvoice.totalAmount,
      currency: getStripeCurrency(crmInvoice.currency), // Use Stripe-compatible currency
      status: stripeInvoice.status,
      dueDate: dueDate ? new Date(dueDate) : null,
      stripeInvoiceUrl: stripeInvoice.hosted_invoice_url,
      stripeInvoicePdf: stripeInvoice.invoice_pdf,
      createdBy: userId,
      companyId: req.user.companyId || req.user.id,
      crmInvoiceId: crmInvoiceId
    });

    console.log('✅ Stripe invoice saved to database:', stripeInvoiceRecord._id);

    // Send the invoice
    const sentInvoice = await stripe.invoices.sendInvoice(stripeInvoice.id);
    console.log('✅ Invoice sent to customer');

    res.status(201).json({
      message: 'Stripe invoice created and sent successfully',
      stripeInvoice: stripeInvoiceRecord,
      hostedUrl: sentInvoice.hosted_invoice_url,
      pdfUrl: sentInvoice.invoice_pdf
    });

  } catch (error) {
    console.error('❌ Error creating Stripe invoice:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Error creating Stripe invoice', 
      error: error.message,
      details: error.stack
    });
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