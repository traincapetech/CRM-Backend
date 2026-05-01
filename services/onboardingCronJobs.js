const cron = require("node-cron");
const CandidateInvite = require("../models/CandidateInvite");
const User = require("../models/User");
const {
  sendJoiningReminderEmail,
  sendJoiningDayWelcomeEmail,
} = require("./emailService");

class OnboardingCronJobs {
  static startAll() {
    console.log("\n📅 Initializing Onboarding Cron Jobs...\n");
    this.sendJoiningDayReminders();
    this.sendExpiryRemindersToHR();
    console.log("✅ Onboarding cron jobs scheduled\n");
  }

  // Daily 8:00 AM — Send day-before reminder to candidates joining TOMORROW
  static sendJoiningDayReminders() {
    cron.schedule("0 8 * * *", async () => {
      try {
        console.log("\n🔄 [ONBOARDING CRON] Joining Day Reminders Started");
        const now = new Date();

        // Candidates joining TOMORROW
        const tomorrowStart = new Date(now);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        tomorrowStart.setHours(0, 0, 0, 0);
        const tomorrowEnd = new Date(tomorrowStart);
        tomorrowEnd.setHours(23, 59, 59, 999);

        const tomorrowCandidates = await CandidateInvite.find({
          onboardingStatus: "APPROVED",
          joiningDate: { $gte: tomorrowStart, $lte: tomorrowEnd },
          reminderOneDaySent: { $ne: true },
        });

        for (const candidate of tomorrowCandidates) {
          try {
            let managerName, managerEmail;
            if (candidate.reportingManagerId) {
              const mgr = await User.findById(candidate.reportingManagerId).select("fullName email");
              if (mgr) { managerName = mgr.fullName; managerEmail = mgr.email; }
            }

            await sendJoiningReminderEmail({
              candidateName: candidate.fullName,
              candidateEmail: candidate.personalEmail,
              joiningDate: candidate.joiningDate,
              joiningTime: candidate.joiningTime,
              branchLocation: candidate.branchLocation,
              reportingManagerName: managerName,
              reportingManagerEmail: managerEmail,
            });

            candidate.reminderOneDaySent = true;
            await candidate.save();
            console.log(`✅ Day-before reminder sent to ${candidate.fullName}`);
          } catch (e) {
            console.error(`❌ Failed reminder for ${candidate.fullName}:`, e.message);
          }
        }

        // Candidates joining TODAY — send joining day email if APPROVED but not finalized
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);

        const todayCandidates = await CandidateInvite.find({
          onboardingStatus: "APPROVED",
          joiningDate: { $gte: todayStart, $lte: todayEnd },
          joiningDayEmailSent: { $ne: true },
        });

        for (const candidate of todayCandidates) {
          console.log(`⚠️  ${candidate.fullName} is joining today but not yet finalized. HR action needed.`);
          // Could send HR notification here
        }

        console.log(`✅ [ONBOARDING CRON] Done — ${tomorrowCandidates.length} tomorrow reminders processed`);
      } catch (error) {
        console.error("❌ [ONBOARDING CRON] Joining reminders failed:", error);
      }
    });
    console.log("📍 Joining Day Reminders: 8:00 AM daily");
  }

  // Daily 11:00 PM — Notify HR of expired/stale invites
  static sendExpiryRemindersToHR() {
    cron.schedule("0 23 * * *", async () => {
      try {
        const staleCount = await CandidateInvite.countDocuments({
          onboardingStatus: { $in: ["LINK_SENT", "OPENED"] },
          tokenExpiry: { $lt: new Date() },
        });
        if (staleCount > 0) {
          console.log(`⚠️  [ONBOARDING CRON] ${staleCount} expired onboarding links need HR attention`);
        }
      } catch (error) {
        console.error("❌ [ONBOARDING CRON] Expiry check failed:", error);
      }
    });
    console.log("📍 Expiry HR Reminders: 11:00 PM daily");
  }
}

module.exports = OnboardingCronJobs;
