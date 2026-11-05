const whatsappService = require("../services/whatsappService");
const Lead = require("../models/Lead");
const Invoice = require("../models/Invoice");

/**
 * @desc Get WhatsApp gateway and session status
 * @route GET /api/whatsapp/status
 * @access Private (Admin, Manager)
 */
exports.getStatus = async (req, res) => {
  try {
    const status = await whatsappService.getStatus();
    return res.status(200).json({ success: true, data: status });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc Get QR Code to pair WhatsApp Web
 * @route GET /api/whatsapp/qr
 * @access Private (Admin)
 */
exports.getQRCode = async (req, res) => {
  try {
    const qrData = await whatsappService.getQRCode();
    return res.status(200).json(qrData);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc Start or reconnect WhatsApp Session
 * @route POST /api/whatsapp/start
 * @access Private (Admin)
 */
exports.startSession = async (req, res) => {
  try {
    const result = await whatsappService.startSession();
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc Send test WhatsApp message
 * @route POST /api/whatsapp/send-test
 * @access Private (Admin)
 */
exports.sendTestMessage = async (req, res) => {
  try {
    const { phone, message, countryCode } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: "Recipient phone is required" });
    }

    const text = message || "🚀 Test message from Traincape CRM WhatsApp Gateway! Integration successful.";
    const result = await whatsappService.sendTextMessage(phone, text, countryCode || "91");

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc Send welcome message to lead via WhatsApp
 * @route POST /api/whatsapp/send-lead/:id
 * @access Private (Admin, Manager, Sales Person)
 */
exports.sendLeadWelcome = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    const result = await whatsappService.sendLeadWelcomeMessage(lead);
    return res.status(result?.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc Send invoice via WhatsApp
 * @route POST /api/whatsapp/send-invoice/:id
 * @access Private (Admin, Manager, Sales Person)
 */
exports.sendInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    const result = await whatsappService.sendInvoiceNotification(invoice);
    return res.status(result?.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

