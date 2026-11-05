const axios = require("axios");

/**
 * Traincape CRM - OpenWA WhatsApp Gateway Service
 *
 * Integrates Traincape CRM with the self-hosted OpenWA HTTP API gateway.
 * Supports:
 * - Automated welcome messages on new lead creation
 * - Invoice and payment receipt delivery via WhatsApp
 * - Payment reminder alerts
 * - Session status & QR code management for WhatsApp Web authentication
 */
class WhatsAppService {
  constructor() {
    this.apiUrl = (process.env.OPENWA_API_URL || "http://localhost:2785").replace(/\/+$/, "");
    this.sessionId = process.env.OPENWA_SESSION_ID || "8255fe0a-42a2-46ed-92c7-a86996704069";
    this.apiKey = process.env.OPENWA_API_KEY || "owa_k1_72605b569636000fed8845a3fcb13adebee783edc56ec74c572be8fa20d6bd2d";
    this.enabled = process.env.WHATSAPP_ENABLED !== "false";
    this.timeout = 10000; // 10s timeout
  }

  /**
   * Helper to build axios request config with optional API key
   */
  _getConfig() {
    const headers = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }
    return { headers, timeout: this.timeout };
  }

  /**
   * Format phone numbers into standard OpenWA WhatsApp chat ID (e.g. "919876543210@c.us")
   * @param {string} phone
   * @param {string} [countryCode]
   * @returns {string|null}
   */
  formatChatId(phone, countryCode = "91") {
    if (!phone) return null;
    let clean = String(phone).replace(/[^0-9]/g, "");

    // If 10 digits (standard Indian mobile without prefix)
    if (clean.length === 10) {
      const code = String(countryCode || "91").replace(/[^0-9]/g, "") || "91";
      clean = `${code}${clean}`;
    }

    if (clean.length < 8) return null; // Invalid number

    return `${clean}@c.us`;
  }

  /**
   * Check connection status of the WhatsApp session
   */
  async getStatus() {
    if (!this.enabled) {
      return { enabled: false, status: "DISABLED", message: "WhatsApp service disabled in configuration" };
    }

    try {
      const res = await axios.get(
        `${this.apiUrl}/api/sessions/${this.sessionId}/status`,
        this._getConfig()
      );
      return {
        enabled: true,
        status: res.data?.status || "ONLINE",
        data: res.data,
      };
    } catch (error) {
      return {
        enabled: true,
        status: "OFFLINE",
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Fetch QR code for pairing WhatsApp on the phone
   */
  async getQRCode() {
    try {
      const res = await axios.get(
        `${this.apiUrl}/api/sessions/${this.sessionId}/qr`,
        this._getConfig()
      );
      return { success: true, qr: res.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Start or create a WhatsApp session
   */
  async startSession() {
    try {
      const res = await axios.post(
        `${this.apiUrl}/api/sessions`,
        { name: this.sessionId },
        this._getConfig()
      );
      return { success: true, data: res.data };
    } catch (error) {
      // If session already exists, return current status
      if (error.response?.status === 409) {
        return this.getStatus();
      }
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Send text message to a WhatsApp number
   * @param {string} to - Raw phone number or chatId
   * @param {string} text - Message content
   * @param {string} [countryCode] - Optional country code
   */
  async sendTextMessage(to, text, countryCode = "91") {
    if (!this.enabled) {
      console.log(`[WhatsAppService] Skipping sendTextMessage (service disabled)`);
      return { success: false, reason: "DISABLED" };
    }

    const chatId = to.includes("@c.us") ? to : this.formatChatId(to, countryCode);
    if (!chatId) {
      console.warn(`[WhatsAppService] Invalid phone number provided: ${to}`);
      return { success: false, error: "INVALID_PHONE_NUMBER" };
    }

    try {
      console.log(`[WhatsAppService] Sending message to ${chatId}...`);
      const res = await axios.post(
        `${this.apiUrl}/api/sessions/${this.sessionId}/messages/text`,
        {
          chatId,
          text,
        },
        this._getConfig()
      );

      console.log(`[WhatsAppService] Message delivered successfully to ${chatId}`);
      return { success: true, data: res.data };
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      console.error(`[WhatsAppService] Failed to send message to ${chatId}:`, msg);
      return { success: false, error: msg };
    }
  }

  /**
   * Send media / document (e.g. PDF invoice or brochure)
   * @param {string} to
   * @param {object} mediaPayload - { url, caption, filename, mimetype }
   * @param {string} [countryCode]
   */
  async sendMediaMessage(to, { url, caption, filename, mimetype }, countryCode = "91") {
    if (!this.enabled) return { success: false, reason: "DISABLED" };

    const chatId = to.includes("@c.us") ? to : this.formatChatId(to, countryCode);
    if (!chatId) return { success: false, error: "INVALID_PHONE_NUMBER" };

    try {
      const res = await axios.post(
        `${this.apiUrl}/api/sessions/${this.sessionId}/messages/media`,
        {
          chatId,
          url,
          caption: caption || "",
          filename: filename || "document.pdf",
          mimetype: mimetype || "application/pdf",
        },
        this._getConfig()
      );
      return { success: true, data: res.data };
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      console.error(`[WhatsAppService] Failed to send media to ${chatId}:`, msg);
      return { success: false, error: msg };
    }
  }

  /**
   * Automated Lead Welcome Message
   * Triggered when a new lead enters the CRM
   */
  async sendLeadWelcomeMessage(lead) {
    if (!lead || (!lead.phone && !lead.whatsappNumber)) return;
    const phone = lead.phone || lead.whatsappNumber;
    const name = lead.name || "Student";
    const course = lead.course || "Technical Training";

    const text = `Hello *${name}*! 👋\n\nThank you for reaching out to *Traincape Technology* regarding our *${course}* program.\n\nOur academic advisor has received your details and will get in touch with you shortly to assist with course syllabus, batches, and enrollment.\n\nHave immediate queries? Simply reply to this chat.\n\n🌐 *Website:* https://traincapetech.in\n📞 *Helpdesk:* +91 91104 31920`;

    return this.sendTextMessage(phone, text, lead.countryCode || "91");
  }

  /**
   * Automated Invoice Notification Message
   */
  async sendInvoiceNotification(invoice) {
    if (!invoice) return;
    const clientPhone =
      invoice.clientInfo?.phone ||
      invoice.clientInfo?.mobile ||
      invoice.clientInfo?.whatsappNumber;

    if (!clientPhone) return;

    const clientName = invoice.clientInfo?.name || "Valued Client";
    const invNumber = invoice.invoiceNumber || "INV";
    const total = Number(invoice.total || invoice.amount || 0).toLocaleString("en-IN");
    const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-IN") : "Upon Receipt";
    const paymentLink = invoice.paymentLink || "https://traincapecrm.traincapetech.in";

    const text = `Dear *${clientName}*,\n\nYour invoice *#${invNumber}* has been issued by *Traincape Technology*.\n\n💵 *Total Amount:* ₹${total}\n📅 *Due Date:* ${dueDate}\n\n👉 *View & Pay Online:* ${paymentLink}\n\nFor any questions or payment confirmations, reply directly to this message. Thank you!`;

    return this.sendTextMessage(clientPhone, text, invoice.clientInfo?.countryCode || "91");
  }

  /**
   * Automated Payment / Token Receipt Confirmation
   */
  async sendPaymentReceipt(sale) {
    if (!sale) return;
    const phone = sale.studentPhone || sale.phone || sale.contactNumber;
    if (!phone) return;

    const studentName = sale.studentName || sale.clientName || "Student";
    const course = sale.course || "Course";
    const paidAmount = Number(sale.paidAmount || sale.tokenAmount || sale.amount || 0).toLocaleString("en-IN");
    const balance = Number(sale.balanceAmount || sale.remainingBalance || 0).toLocaleString("en-IN");

    const text = `Dear *${studentName}*,\n\nWe have successfully received your payment of *₹${paidAmount}* for *${course}*! 🎉\n\n📝 *Remaining Balance:* ₹${balance}\n🏛️ *Institution:* Traincape Technology\n\nWelcome aboard! Your batch coordinator will contact you with orientation and portal access details.\n\nNeed help? Reply to this message anytime.`;

    return this.sendTextMessage(phone, text, sale.countryCode || "91");
  }
}

const whatsappService = new WhatsAppService();
module.exports = whatsappService;

