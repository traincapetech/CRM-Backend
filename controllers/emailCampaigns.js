/**
 * Email Campaign Controller
 *
 * Handles email campaign operations
 */

const EmailCampaign = require("../models/EmailCampaign");
const EmailTemplate = require("../models/EmailTemplate");
const Lead = require("../models/Lead");
const Sale = require("../models/Sale");
const { sendEmail } = require("../config/nodemailer");
const {
  buildTemplateVariables,
  replaceTemplateVariables,
} = require("../utils/templateVariables");
const { addEmailTracking } = require("../utils/emailTracking");

const isAdminOrManager = (user) => ["Admin", "Manager"].includes(user.role);

const canAccessCampaign = (req, campaign) => {
  if (isAdminOrManager(req.user)) return true;
  if (req.user.role === "Lead Person") {
    const createdById = campaign.createdBy?._id
      ? campaign.createdBy._id.toString()
      : campaign.createdBy?.toString();
    return createdById === req.user.id;
  }
  return false;
};

// Helper function to normalize course value
const normalizeCourse = (course) => {
  if (!course) return "";
  return course.trim().toLowerCase();
};

// Helper function to validate email
const isValidEmail = (email) => {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed === "") return false;
  // Basic email validation - must contain @ and have valid format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
};

// @desc    Get all campaigns
// @route   GET /api/email-campaigns
// @access  Private (Admin, Manager)
exports.getCampaigns = async (req, res) => {
  try {
    const filter = isAdminOrManager(req.user) ? {} : { createdBy: req.user.id };

    const campaigns = await EmailCampaign.find(filter)
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    // Self-healing: Check for stuck 'sending' campaigns
    const updates = campaigns.map(async (campaign) => {
      if (
        campaign.status === "sending" &&
        campaign.stats.totalRecipients > 0 &&
        campaign.stats.sent >= campaign.stats.totalRecipients
      ) {
        campaign.status = "sent";
        campaign.completedAt = new Date();
        await campaign.save();
      }
    });

    await Promise.all(updates);

    res.status(200).json({
      success: true,
      count: campaigns.length,
      data: campaigns,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single campaign
// @route   GET /api/email-campaigns/:id
// @access  Private
exports.getCampaign = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id).populate(
      "createdBy",
      "fullName email",
    );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    if (!canAccessCampaign(req, campaign)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this campaign",
      });
    }

    // Self-healing: Check if stuck 'sending'
    if (
      campaign.status === "sending" &&
      campaign.stats.totalRecipients > 0 &&
      campaign.stats.sent >= campaign.stats.totalRecipients
    ) {
      campaign.status = "sent";
      campaign.completedAt = new Date();
      await campaign.save();
    }

    res.status(200).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Create new campaign
// @route   POST /api/email-campaigns
// @access  Private (Admin, Manager)
exports.createCampaign = async (req, res) => {
  try {
    req.body.createdBy = req.user.id;
    const campaign = await EmailCampaign.create(req.body);

    res.status(201).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update campaign
// @route   PUT /api/email-campaigns/:id
// @access  Private
exports.updateCampaign = async (req, res) => {
  try {
    req.body.updatedBy = req.user.id;
    const existingCampaign = await EmailCampaign.findById(req.params.id);

    if (!existingCampaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    if (!canAccessCampaign(req, existingCampaign)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this campaign",
      });
    }

    existingCampaign.set(req.body);
    const campaign = await existingCampaign.save();

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    res.status(200).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Send campaign
// @route   POST /api/email-campaigns/:id/send
// @access  Private
exports.sendCampaign = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    if (!canAccessCampaign(req, campaign)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to send this campaign",
      });
    }

    // Get recipients based on recipientType
    let recipients = [];
    let totalMatchedLeads = 0;
    let validEmailLeads = 0;
    let skippedNoEmailLeads = 0;
    let segmentCounts = {
      leadsMatched: 0,
      leadsValidEmails: 0,
      customersMatched: 0,
      customersValidEmails: 0,
    };

    if (
      campaign.recipientType === "all" ||
      campaign.recipientType === "leads"
    ) {
      let query = {};

      // For "leads" type, courses are required
      if (campaign.recipientType === "leads") {
        if (
          !campaign.selectedCourses ||
          !Array.isArray(campaign.selectedCourses) ||
          campaign.selectedCourses.length === 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Please select at least one course for "All Leads" or use Manual List.',
          });
        }
      }

      // If courses are selected, filter by courses (for both "all" and "leads")
      if (
        campaign.selectedCourses &&
        Array.isArray(campaign.selectedCourses) &&
        campaign.selectedCourses.length > 0
      ) {
        // Normalize course values
        const normalizedCourses = campaign.selectedCourses.map((c) =>
          normalizeCourse(c),
        );
        // Build case-insensitive regex for matching
        const courseRegex = new RegExp(
          normalizedCourses
            .map((c) => `^${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
            .join("|"),
          "i",
        );
        query.course = { $regex: courseRegex };
      }

      // For "all" type without courses, get all leads (no course filter)

      // Get all matching leads
      const allLeads = await Lead.find(query)
        .select("name email course country company")
        .lean();
      totalMatchedLeads = allLeads.length;

      // Filter leads with valid emails
      recipients = allLeads
        .filter((lead) => isValidEmail(lead.email))
        .map((lead) => ({
          email: lead.email.trim(),
          name: lead.name,
          leadId: lead._id,
          course: lead.course,
          country: lead.country,
          company: lead.company,
        }));

      validEmailLeads = recipients.length;
      skippedNoEmailLeads = totalMatchedLeads - validEmailLeads;

      // Validate that we have valid recipients
      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid email recipients found for selected course(s).",
          data: {
            totalMatchedLeads,
            validEmailLeads: 0,
            skippedNoEmailLeads,
          },
        });
      }
    } else if (campaign.recipientType === "customers") {
      const sales = await Sale.find({}).select(
        "customerName email course country",
      );
      recipients = sales
        .filter((sale) => isValidEmail(sale.email))
        .map((sale) => ({
          email: sale.email.trim(),
          name: sale.customerName,
          course: sale.course,
          country: sale.country,
        }));

      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid email recipients found in customers.",
        });
      }
    } else if (campaign.recipientType === "manual") {
      // Validate manual list emails
      recipients = (campaign.recipientList || [])
        .filter((recipient) => isValidEmail(recipient.email))
        .map((recipient) => ({
          email: recipient.email.trim(),
          name: recipient.name || recipient.email.split("@")[0],
        }));

      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Manual list campaigns must have at least one valid email address.",
        });
      }
    } else if (campaign.recipientType === "segment") {
      const criteria = campaign.segmentCriteria || {};
      const {
        statuses = [],
        countries = [],
        courses = [],
        includeCustomers = false,
        dateRange = {},
      } = criteria;

      const hasFilters =
        statuses.length > 0 ||
        countries.length > 0 ||
        courses.length > 0 ||
        dateRange.start ||
        dateRange.end ||
        includeCustomers;

      if (!hasFilters) {
        return res.status(400).json({
          success: false,
          message: "Please add at least one filter or include customers.",
        });
      }

      // Build lead query
      const leadQuery = {};
      if (statuses.length > 0) {
        leadQuery.status = { $in: statuses };
      }
      if (countries.length > 0) {
        leadQuery.country = {
          $in: countries.map(
            (c) =>
              new RegExp(
                `^${c.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}$`,
                "i",
              ),
          ),
        };
      }
      if (courses.length > 0) {
        const normalizedCourses = courses.map((c) => normalizeCourse(c));
        const courseRegex = new RegExp(
          normalizedCourses
            .map((c) => `^${c.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}$`)
            .join("|"),
          "i",
        );
        leadQuery.course = { $regex: courseRegex };
      }
      if (dateRange.start || dateRange.end) {
        leadQuery.createdAt = {};
        if (dateRange.start)
          leadQuery.createdAt.$gte = new Date(dateRange.start);
        if (dateRange.end) leadQuery.createdAt.$lte = new Date(dateRange.end);
      }

      const segmentLeads = await Lead.find(leadQuery)
        .select("name email course country company createdAt")
        .lean();
      segmentCounts.leadsMatched = segmentLeads.length;

      const validLeadRecipients = segmentLeads
        .filter((lead) => isValidEmail(lead.email))
        .map((lead) => ({
          email: lead.email.trim(),
          name: lead.name,
          leadId: lead._id,
          course: lead.course,
          country: lead.country,
          company: lead.company,
        }));

      segmentCounts.leadsValidEmails = validLeadRecipients.length;

      let customerRecipients = [];
      if (includeCustomers) {
        const customerQuery = {};
        if (countries.length > 0) {
          customerQuery.country = {
            $in: countries.map(
              (c) =>
                new RegExp(
                  `^${c.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}$`,
                  "i",
                ),
            ),
          };
        }
        if (courses.length > 0) {
          const normalizedCourses = courses.map((c) => normalizeCourse(c));
          const courseRegex = new RegExp(
            normalizedCourses
              .map((c) => `^${c.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}$`)
              .join("|"),
            "i",
          );
          customerQuery.course = { $regex: courseRegex };
        }
        if (dateRange.start || dateRange.end) {
          customerQuery.date = {};
          if (dateRange.start)
            customerQuery.date.$gte = new Date(dateRange.start);
          if (dateRange.end) customerQuery.date.$lte = new Date(dateRange.end);
        }

        const sales = await Sale.find(customerQuery)
          .select("customerName email course country date")
          .lean();
        segmentCounts.customersMatched = sales.length;

        customerRecipients = sales
          .filter((sale) => isValidEmail(sale.email))
          .map((sale) => ({
            email: sale.email.trim(),
            name: sale.customerName,
            course: sale.course,
            country: sale.country,
          }));

        segmentCounts.customersValidEmails = customerRecipients.length;
      }

      recipients = [...validLeadRecipients, ...customerRecipients];
      totalMatchedLeads =
        segmentCounts.leadsMatched + segmentCounts.customersMatched;
      validEmailLeads = recipients.length;
      skippedNoEmailLeads = totalMatchedLeads - validEmailLeads;

      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "No valid email recipients found for the selected segment filters.",
          data: {
            totalMatchedLeads,
            validEmailLeads: 0,
            skippedNoEmailLeads,
          },
        });
      }
    }

    // Update campaign status to 'sending'
    campaign.status = "sending";
    campaign.stats.totalRecipients = recipients.length;
    campaign.stats.sent = 0;
    campaign.stats.delivered = 0;
    campaign.stats.bounced = 0;

    // Initialize recipient tracking for individual engagement monitoring
    campaign.recipientTracking = recipients.map((r) => ({
      email: r.email,
      name: r.name,
      status: "queued",
      openCount: 0,
      clickCount: 0,
    }));

    await campaign.save();

    const senderName =
      req.user?.fullName || process.env.FROM_NAME || "Traincape Team";
    const preparedRecipients = recipients.map((recipient) => ({
      ...recipient,
      counselor_name: senderName,
    }));

    // Trigger async background processing without blocking HTTP response
    setImmediate(() => {
      executeCampaignDispatch(campaign._id, preparedRecipients, senderName);
    });

    return res.status(200).json({
      success: true,
      message: `Campaign dispatch started! Sending to ${recipients.length} recipients in background.`,
      data: {
        campaignId: campaign._id,
        status: "sending",
        totalRecipients: recipients.length,
        totalMatchedLeads:
          campaign.recipientType === "leads" || campaign.recipientType === "all"
            ? totalMatchedLeads
            : undefined,
        validEmailLeads:
          campaign.recipientType === "leads" || campaign.recipientType === "all"
            ? validEmailLeads
            : undefined,
        skippedNoEmailLeads:
          campaign.recipientType === "leads" || campaign.recipientType === "all"
            ? skippedNoEmailLeads
            : undefined,
        segment:
          campaign.recipientType === "segment"
            ? {
                leadsMatched: segmentCounts.leadsMatched,
                leadsValidEmails: segmentCounts.leadsValidEmails,
                customersMatched: segmentCounts.customersMatched,
                customersValidEmails: segmentCounts.customersValidEmails,
              }
            : undefined,
      },
    });
  } catch (error) {
    // If campaign was set to 'sending' but we hit an error, reset it
    try {
      const failedCampaign = await EmailCampaign.findById(req.params.id);
      if (
        failedCampaign &&
        failedCampaign.status === "sending" &&
        failedCampaign.stats.sent === 0
      ) {
        failedCampaign.status = "draft";
        await failedCampaign.save();
        console.log(
          `↩️ Campaign ${req.params.id} reset to draft due to send error`,
        );
      }
    } catch (resetError) {
      console.error("Error resetting campaign status:", resetError);
    }

    console.error("❌ Campaign send error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to send campaign",
    });
  }
};

const unescapeHtmlEntities = (str) => {
  if (!str) return "";
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
};

const formatHtmlEmailDocument = (bodyHtml, subject = "") => {
  let cleanHtml = unescapeHtmlEntities(bodyHtml || "");

  // Convert plain text line breaks to <p> tags if no HTML elements exist
  if (!/<[a-z][\s\S]*>/i.test(cleanHtml)) {
    cleanHtml = cleanHtml
      .split("\n\n")
      .map(
        (paragraph) =>
          `<p style="margin: 0 0 16px 0; line-height: 1.6; color: #334155; font-size: 15px;">${paragraph.replace(/\n/g, "<br/>")}</p>`,
      )
      .join("");
  }

  // If already a full HTML document, return decoded cleanHtml
  if (cleanHtml.includes("<html") || cleanHtml.includes("<!DOCTYPE")) {
    return cleanHtml;
  }

  // Wrap snippet inside a modern responsive HTML email document template
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject || "Traincape CRM"}</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#ffffff; border-radius:16px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header Bar -->
          <tr>
            <td style="background-color:#0f172a; padding:24px 32px; text-align:left;">
              <span style="color:#ffffff; font-size:18px; font-weight:800; letter-spacing:-0.5px;">TRAINCAPE TECHNOLOGY</span>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding:32px; color:#334155; font-size:15px; line-height:1.6;">
              ${cleanHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f1f5f9; padding:20px 32px; border-top:1px solid #e2e8f0; text-align:center; color:#64748b; font-size:12px; line-height:1.5;">
              <p style="margin:0 0 4px 0; font-weight:600; color:#475569;">Traincape Technology CRM</p>
              <p style="margin:0;">If you have any questions, reply directly to this email or contact support.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// Async Background Queue Executor (Rate-limited, resilient)
const executeCampaignDispatch = async (campaignId, preparedRecipients, senderName) => {
  try {
    const campaign = await EmailCampaign.findById(campaignId);
    if (!campaign) return;

    console.log(`🚀 [Background Queue] Starting campaign "${campaign.name}" (${preparedRecipients.length} recipients)...`);
    let sent = campaign.stats.sent || 0;
    let delivered = campaign.stats.delivered || 0;
    let bounced = campaign.stats.bounced || 0;

    const batchSize = 10;
    const delayBetweenBatches = 1500; // 1.5s delay between batches to respect rate limits

    for (let i = 0; i < preparedRecipients.length; i += batchSize) {
      const batch = preparedRecipients.slice(i, i + batchSize);

      for (const recipient of batch) {
        try {
          const variables = buildTemplateVariables(recipient, { fromName: senderName });
          const subject = replaceTemplateVariables(campaign.subject, variables);
          const rawTemplate = replaceTemplateVariables(campaign.template, variables);
          const formattedHtml = formatHtmlEmailDocument(rawTemplate, subject);
          const finalHtml = addEmailTracking(
            formattedHtml,
            campaign._id.toString(),
            recipient.email
          );

          // Clean plain text fallback
          const plainText = unescapeHtmlEntities(rawTemplate).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

          const ok = await sendEmail(recipient.email, subject, plainText, finalHtml);

          sent++;
          if (ok !== false) {
            delivered++;
          } else {
            bounced++;
          }

          const trackingEntry = campaign.recipientTracking.find((r) => r.email === recipient.email);
          if (trackingEntry) {
            trackingEntry.status = ok !== false ? "sent" : "bounced";
            trackingEntry.sentAt = new Date();
          }
        } catch (err) {
          console.error(`❌ Campaign email failed for ${recipient.email}:`, err.message);
          sent++;
          bounced++;
          const trackingEntry = campaign.recipientTracking.find((r) => r.email === recipient.email);
          if (trackingEntry) {
            trackingEntry.status = "bounced";
          }
        }
      }

      campaign.stats.sent = sent;
      campaign.stats.delivered = delivered;
      campaign.stats.bounced = bounced;
      await campaign.save();

      if (i + batchSize < preparedRecipients.length) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
      }
    }

    campaign.status = delivered > 0 ? "sent" : "cancelled";
    campaign.sentAt = campaign.sentAt || new Date();
    campaign.completedAt = new Date();
    await campaign.save();

    console.log(`✅ [Background Queue] Campaign "${campaign.name}" complete! ${delivered} delivered, ${bounced} bounced.`);
  } catch (error) {
    console.error("❌ [Background Queue Error]:", error);
  }
};

// @desc    Send test preview email for a campaign
// @route   POST /api/email-campaigns/send-test
// @access  Private
exports.sendTestEmail = async (req, res) => {
  try {
    const { email, subject, template } = req.body;
    const recipientEmail = email || req.user?.email;

    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid test recipient email address",
      });
    }

    const testRecipient = {
      email: recipientEmail,
      name: req.user?.fullName || "Valued Lead",
      course: "Full Stack Web Development",
      country: "India",
      company: "Traincape Tech",
      counselor_name: req.user?.fullName || "Traincape Counselor",
    };

    const variables = buildTemplateVariables(testRecipient, {
      fromName: req.user?.fullName,
    });

    const testSubject = replaceTemplateVariables(subject || "Test Campaign Preview", variables);
    const rawHtml = replaceTemplateVariables(template || "<p>This is a test email preview.</p>", variables);
    const formattedHtml = formatHtmlEmailDocument(rawHtml, testSubject);

    const plainText = unescapeHtmlEntities(rawHtml).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    await sendEmail(recipientEmail, testSubject, plainText, formattedHtml);

    res.status(200).json({
      success: true,
      message: `Test preview email sent successfully to ${recipientEmail}!`,
    });
  } catch (error) {
    console.error("❌ Send test email error:", error);
    res.status(500).json({
      success: false,
      message: `Failed to send test email: ${error.message}`,
    });
  }
};

// @desc    Get campaign analytics
// @route   GET /api/email-campaigns/:id/analytics
// @access  Private
exports.getCampaignAnalytics = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id).populate(
      "createdBy",
      "fullName email",
    );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    if (!canAccessCampaign(req, campaign)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this campaign",
      });
    }

    const stats = campaign.stats || {};
    const openRate = campaign.calculateOpenRate();
    const clickRate = campaign.calculateClickRate();
    const deliveryRate =
      stats.sent > 0 ? (stats.delivered / stats.sent) * 100 : 0;
    const bounceRate = stats.sent > 0 ? (stats.bounced / stats.sent) * 100 : 0;
    const unsubscribeRate =
      stats.delivered > 0 ? (stats.unsubscribed / stats.delivered) * 100 : 0;

    // Calculate engagement score (weighted metric)
    const engagementScore = (openRate * 0.4 + clickRate * 0.6).toFixed(2);

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        openRate: parseFloat(openRate.toFixed(2)),
        clickRate: parseFloat(clickRate.toFixed(2)),
        deliveryRate: parseFloat(deliveryRate.toFixed(2)),
        bounceRate: parseFloat(bounceRate.toFixed(2)),
        unsubscribeRate: parseFloat(unsubscribeRate.toFixed(2)),
        engagementScore: parseFloat(engagementScore),
        campaign: {
          name: campaign.name,
          subject: campaign.subject,
          status: campaign.status,
          recipientType: campaign.recipientType,
          sentAt: campaign.sentAt,
          completedAt: campaign.completedAt,
          createdAt: campaign.createdAt,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Track email open
// @route   GET /api/email-campaigns/track/open
// @access  Public
exports.trackOpen = async (req, res) => {
  // Respond with pixel IMMEDIATELY (before DB update) to avoid timeout on cold starts
  const img = Buffer.from(
    "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
    "base64",
  );
  res.setHeader("Content-Type", "image/gif");
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.send(img);

  // Fire-and-forget: update DB after response is sent
  try {
    const campaignId = req.query.c;
    const recipientEmail = req.query.e;

    if (campaignId) {
      console.log(
        `📬 Email OPEN tracked: campaign=${campaignId}, email=${recipientEmail || "unknown"}`,
      );

      // Update aggregate stats
      await EmailCampaign.findByIdAndUpdate(campaignId, {
        $inc: { "stats.opened": 1 },
      });

      // Update individual recipient tracking if email is provided
      if (recipientEmail) {
        await EmailCampaign.findOneAndUpdate(
          {
            _id: campaignId,
            "recipientTracking.email": recipientEmail,
          },
          {
            $set: {
              "recipientTracking.$.status": "opened",
              "recipientTracking.$.openedAt": new Date(),
            },
            $inc: { "recipientTracking.$.openCount": 1 },
          },
        );
      }
    }
  } catch (error) {
    console.error("❌ Error tracking email open:", error.message);
  }
};

// @desc    Track email click and redirect
// @route   GET /api/email-campaigns/track/click
// @access  Public
exports.trackClick = async (req, res) => {
  const campaignId = req.query.c;
  const recipientEmail = req.query.e;
  const redirectUrl = req.query.u;

  // Redirect immediately, update DB after
  if (!redirectUrl) {
    return res.status(400).send("Missing redirect URL");
  }

  res.redirect(redirectUrl);

  // Fire-and-forget: update DB after redirect is sent
  try {
    if (campaignId) {
      console.log(
        `🖱️ Email CLICK tracked: campaign=${campaignId}, email=${recipientEmail || "unknown"}, url=${redirectUrl}`,
      );

      // Update aggregate stats
      await EmailCampaign.findByIdAndUpdate(campaignId, {
        $inc: { "stats.clicked": 1 },
      });

      // Update individual recipient tracking if email is provided
      if (recipientEmail) {
        await EmailCampaign.findOneAndUpdate(
          {
            _id: campaignId,
            "recipientTracking.email": recipientEmail,
          },
          {
            $set: {
              "recipientTracking.$.status": "clicked",
              "recipientTracking.$.clickedAt": new Date(),
            },
            $inc: { "recipientTracking.$.clickCount": 1 },
          },
        );
      }
    }
  } catch (error) {
    console.error("❌ Error tracking email click:", error.message);
  }
};

// @desc    Delete campaign
// @route   DELETE /api/email-campaigns/:id
// @access  Private
exports.deleteCampaign = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    if (!canAccessCampaign(req, campaign)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this campaign",
      });
    }

    await campaign.deleteOne();

    res.status(200).json({
      success: true,
      message: "Campaign deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get unique courses from leads
// @route   GET /api/email-campaigns/courses/available
// @access  Private
exports.getAvailableCourses = async (req, res) => {
  try {
    console.log("📚 Fetching available courses from leads...");

    // Get all unique course values from leads - simplified query
    // The course field exists and is a string, so we can query directly
    const leads = await Lead.find({
      course: { $exists: true, $ne: null, $ne: "" },
    })
      .select("course")
      .lean();

    console.log(`📊 Found ${leads.length} leads with course information`);

    // Create a map to store normalized -> formatted mapping
    const courseMap = new Map();

    leads.forEach((lead) => {
      if (lead.course && typeof lead.course === "string") {
        const trimmed = lead.course.trim();
        if (trimmed !== "") {
          const normalized = normalizeCourse(trimmed);
          const formatted = trimmed;

          // Keep the most common formatted version (or first encountered)
          if (!courseMap.has(normalized)) {
            courseMap.set(normalized, formatted);
          }
        }
      }
    });

    // Convert map to array of { value, label } objects
    const courses = Array.from(courseMap.entries())
      .map(([value, label]) => ({
        value,
        label,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    console.log(
      `✅ Found ${courses.length} unique courses:`,
      courses.map((c) => c.label).join(", "),
    );

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    console.error("❌ Error fetching available courses:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get recipient counts for course selection
// @route   POST /api/email-campaigns/courses/preview
// @access  Private
exports.previewCourseRecipients = async (req, res) => {
  try {
    const { courses } = req.body;

    if (!courses || !Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one course",
      });
    }

    // Normalize course values
    const normalizedCourses = courses.map((c) => normalizeCourse(c));

    // Build query for case-insensitive matching
    const courseRegex = new RegExp(
      normalizedCourses
        .map((c) => `^${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
        .join("|"),
      "i",
    );

    // Get all leads matching the courses (case-insensitive)
    const allLeads = await Lead.find({
      course: { $regex: courseRegex },
    })
      .select("name email course")
      .lean();

    // Filter leads with valid emails
    const validEmailLeads = allLeads.filter((lead) => isValidEmail(lead.email));
    const skippedNoEmail = allLeads.length - validEmailLeads.length;

    res.status(200).json({
      success: true,
      data: {
        totalMatchedLeads: allLeads.length,
        validEmailLeads: validEmailLeads.length,
        skippedNoEmailLeads: skippedNoEmail,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Clone a campaign (for follow-ups)
// @route   POST /api/email-campaigns/:id/clone
// @access  Private
exports.cloneCampaign = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    if (!canAccessCampaign(req, campaign)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to clone this campaign",
      });
    }

    // Create clone with modified name
    const cloneData = campaign.toObject();
    delete cloneData._id;
    delete cloneData.stats;
    delete cloneData.recipientTracking;
    delete cloneData.sentAt;
    delete cloneData.completedAt;
    delete cloneData.createdAt;
    delete cloneData.updatedAt;

    const clonedCampaign = await EmailCampaign.create({
      ...cloneData,
      name: `${campaign.name} (Follow-up)`,
      status: "draft",
      parentCampaignId: campaign._id,
      createdBy: req.user.id,
      stats: {
        totalRecipients: 0,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0,
      },
    });

    res.status(201).json({
      success: true,
      message: "Campaign cloned successfully",
      data: clonedCampaign,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get recipient engagement for a campaign
// @route   GET /api/email-campaigns/:id/recipients
// @access  Private
exports.getRecipientEngagement = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id).select(
      "name stats recipientTracking status sentAt",
    );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    if (!canAccessCampaign(req, campaign)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this campaign",
      });
    }

    // Calculate engagement summary
    const tracking = campaign.recipientTracking || [];
    const summary = {
      total: tracking.length,
      opened: tracking.filter(
        (r) => r.status === "opened" || r.status === "clicked",
      ).length,
      clicked: tracking.filter((r) => r.status === "clicked").length,
      notOpened: tracking.filter(
        (r) => r.status === "sent" || r.status === "delivered",
      ).length,
    };

    res.status(200).json({
      success: true,
      data: {
        campaign: {
          name: campaign.name,
          status: campaign.status,
          sentAt: campaign.sentAt,
        },
        summary,
        recipients: tracking.map((r) => ({
          email: r.email,
          name: r.name,
          status: r.status,
          openedAt: r.openedAt,
          clickedAt: r.clickedAt,
          openCount: r.openCount,
          clickCount: r.clickCount,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Send reminder to non-openers
// @route   POST /api/email-campaigns/:id/send-reminder
// @access  Private
exports.sendReminder = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    if (!canAccessCampaign(req, campaign)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to send reminder for this campaign",
      });
    }

    if (campaign.status !== "sent") {
      return res.status(400).json({
        success: false,
        message: "Can only send reminders for sent campaigns",
      });
    }

    // Get non-openers from recipient tracking
    const nonOpeners = (campaign.recipientTracking || [])
      .filter((r) => r.status === "sent" || r.status === "delivered")
      .map((r) => ({
        email: r.email,
        name: r.name,
      }));

    if (nonOpeners.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No non-openers found. Everyone has opened the campaign!",
      });
    }

    // Create a follow-up campaign targeting non-openers
    const reminderCampaign = await EmailCampaign.create({
      name: `${campaign.name} (Reminder)`,
      description: `Reminder for non-openers of "${campaign.name}"`,
      subject: req.body.subject || `Reminder: ${campaign.subject}`,
      template: req.body.template || campaign.template,
      recipientType: "manual",
      recipientList: nonOpeners,
      status: "draft",
      parentCampaignId: campaign._id,
      createdBy: req.user.id,
      stats: {
        totalRecipients: nonOpeners.length,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0,
      },
    });

    res.status(201).json({
      success: true,
      message: `Reminder campaign created with ${nonOpeners.length} non-openers`,
      data: reminderCampaign,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
