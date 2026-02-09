/**
 * Email Queue Service
 *
 * Handles email sending with rate limiting, batch processing, and retry logic
 * Uses Bull queue with Redis for background processing
 */

let Queue = null;
try {
  Queue = require("bull");
} catch (error) {
  console.warn("⚠️ Bull queue library not installed. Run: npm install bull");
}

const EmailCampaign = require("../models/EmailCampaign");
const { sendEmail } = require("../config/nodemailer");
const { addEmailTracking } = require("../utils/emailTracking");
const {
  buildTemplateVariables,
  replaceTemplateVariables,
} = require("../utils/templateVariables");

// Initialize queue with Redis connection
let emailQueue = null;

const initEmailQueue = () => {
  if (emailQueue) return emailQueue;
  if (!Queue) {
    console.warn("⚠️ Bull queue not available. Install with: npm install bull");
    return null;
  }

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  try {
    emailQueue = new Queue("email-campaigns", {
      redis: redisUrl,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    });

    // Process emails with rate limiting
    emailQueue.process("send-email", 10, async (job) => {
      const { recipient, campaignId, subject, htmlContent, plainText } =
        job.data;

      try {
        await sendEmail(recipient.email, subject, plainText, htmlContent);

        // Update campaign stats
        const updatedCampaign = await EmailCampaign.findByIdAndUpdate(
          campaignId,
          {
            $inc: {
              "stats.sent": 1,
              "stats.delivered": 1,
            },
          },
          { new: true },
        );

        // Check if campaign is complete
        if (
          updatedCampaign &&
          updatedCampaign.stats.sent >= updatedCampaign.stats.totalRecipients
        ) {
          await EmailCampaign.findByIdAndUpdate(campaignId, {
            status: "sent",
            completedAt: new Date(),
          });
          console.log(`✅ Campaign ${campaignId} completed!`);
        }

        return { success: true, email: recipient.email };
      } catch (error) {
        console.error(`Failed to send email to ${recipient.email}:`, error);

        // Update bounce count
        const updatedCampaign = await EmailCampaign.findByIdAndUpdate(
          campaignId,
          {
            $inc: {
              "stats.sent": 1, // Count as processed even if bounced
              "stats.bounced": 1,
            },
          },
          { new: true },
        );

        // Check if campaign is complete even on error
        if (
          updatedCampaign &&
          updatedCampaign.stats.sent >= updatedCampaign.stats.totalRecipients
        ) {
          await EmailCampaign.findByIdAndUpdate(campaignId, {
            status: "sent",
            completedAt: new Date(),
          });
          console.log(`✅ Campaign ${campaignId} completed (with failures)!`);
        }

        throw error; // Will trigger retry
      }
    });

    // Event listeners
    emailQueue.on("completed", (job, result) => {
      console.log(`✅ Email sent successfully to ${result.email}`);
    });

    emailQueue.on("failed", (job, err) => {
      console.error(
        `❌ Email failed after ${job.attemptsMade} attempts:`,
        err.message,
      );
    });

    emailQueue.on("stalled", (job) => {
      console.warn(`⚠️ Job stalled: ${job.id}`);
    });

    console.log("📧 Email queue initialized");
    return emailQueue;
  } catch (error) {
    console.error("Failed to initialize email queue:", error);
    return null;
  }
};

/**
 * Add emails to queue in batches
 * @param {Array} recipients - Array of recipient objects
 * @param {String} campaignId - Campaign ID
 * @param {String} subject - Email subject
 * @param {String} htmlContent - HTML email content
 * @param {String} plainText - Plain text email content
 * @param {Number} batchSize - Number of emails per batch (default: 50)
 * @param {Number} delayBetweenBatches - Delay in ms between batches (default: 1000)
 */
const queueEmails = async (
  recipients,
  campaignId,
  subject,
  htmlContent,
  plainText,
  batchSize = 50,
  delayBetweenBatches = 1000,
) => {
  if (!emailQueue) {
    initEmailQueue();
  }

  if (!emailQueue || !Queue) {
    throw new Error(
      "Email queue not available. Install Bull: npm install bull. Or check Redis connection.",
    );
  }

  const totalRecipients = recipients.length;
  const batches = [];

  // Split recipients into batches
  for (let i = 0; i < totalRecipients; i += batchSize) {
    batches.push(recipients.slice(i, i + batchSize));
  }

  console.log(
    `📬 Queueing ${totalRecipients} emails in ${batches.length} batches`,
  );

  // Add jobs to queue with delays between batches
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const delay = batchIndex * delayBetweenBatches;

    for (const recipient of batch) {
      const variables = buildTemplateVariables(recipient);
      const personalizedSubject = replaceTemplateVariables(subject, variables);
      const personalizedHtml = addEmailTracking(
        replaceTemplateVariables(htmlContent, variables),
        campaignId,
        recipient.email,
      );
      const personalizedPlainText = replaceTemplateVariables(
        plainText,
        variables,
      );

      await emailQueue.add(
        "send-email",
        {
          recipient,
          campaignId,
          subject: personalizedSubject,
          htmlContent: personalizedHtml,
          plainText: personalizedPlainText,
        },
        {
          delay,
          jobId: `${campaignId}-${recipient.email}`, // Prevent duplicates
        },
      );
    }
  }

  return {
    totalQueued: totalRecipients,
    batches: batches.length,
    queueName: "email-campaigns",
  };
};

/**
 * Get queue status and progress
 * @param {String} campaignId - Campaign ID
 */
const getQueueStatus = async (campaignId) => {
  if (!emailQueue) {
    return null;
  }

  const jobs = await emailQueue.getJobs([
    "waiting",
    "active",
    "completed",
    "failed",
  ]);
  const campaignJobs = jobs.filter((job) => job.data.campaignId === campaignId);

  const status = {
    waiting: campaignJobs.filter((j) => j.opts.delay > Date.now()).length,
    active: campaignJobs.filter(
      (j) => j.opts.delay <= Date.now() && !j.finishedOn,
    ).length,
    completed: campaignJobs.filter((j) => j.finishedOn && !j.failedReason)
      .length,
    failed: campaignJobs.filter((j) => j.failedReason).length,
    total: campaignJobs.length,
  };

  return status;
};

/**
 * Get queue statistics
 */
const getQueueStats = async () => {
  if (!emailQueue) {
    return null;
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    emailQueue.getWaitingCount(),
    emailQueue.getActiveCount(),
    emailQueue.getCompletedCount(),
    emailQueue.getFailedCount(),
    emailQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
};

/**
 * Pause queue processing
 */
const pauseQueue = async () => {
  if (!emailQueue) return;
  await emailQueue.pause();
  console.log("⏸️ Email queue paused");
};

/**
 * Resume queue processing
 */
const resumeQueue = async () => {
  if (!emailQueue) return;
  await emailQueue.resume();
  console.log("▶️ Email queue resumed");
};

/**
 * Clean queue (remove old jobs)
 */
const cleanQueue = async (grace = 24 * 3600 * 1000) => {
  if (!emailQueue) return;

  await emailQueue.clean(grace, "completed");
  await emailQueue.clean(grace * 7, "failed");
  console.log("🧹 Email queue cleaned");
};

module.exports = {
  initEmailQueue,
  queueEmails,
  getQueueStatus,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  getQueue: () => emailQueue,
};
