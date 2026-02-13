const cron = require("node-cron");
const PerformanceCalculationService = require("../services/performanceCalculation");
const PIPService = require("../services/pipService");

/**
 * Performance Cron Jobs Scheduler
 * Automated jobs for performance tracking
 */

class PerformanceCronJobs {
  /**
   * Start all cron jobs
   */
  static startAll() {
    console.log("\n📅 Initializing Performance Management Cron Jobs...\n");

    // Daily performance calculation - runs at 12:05 AM every day
    this.dailyPerformanceCalculation();

    // Check for PIP triggers - runs at 1:00 AM every day
    this.dailyPIPCheck();

    // Weekly performance summary - runs every Monday at 9:00 AM
    this.weeklyPerformanceSummary();

    console.log("✅ All Performance cron jobs scheduled successfully\n");
  }

  /**
   * Daily Performance Calculation
   * Runs at 12:05 AM every day to calculate yesterday's performance
   */
  static dailyPerformanceCalculation() {
    // Cron format: minute hour day month dayOfWeek
    // 5 0 * * * = 12:05 AM every day
    cron.schedule("5 0 * * *", async () => {
      try {
        console.log("\n🔄 [CRON] Daily Performance Calculation Started");
        console.log(`⏰ Time: ${new Date().toLocaleString()}`);

        const result =
          await PerformanceCalculationService.runDailyCalculation();

        console.log(`✅ [CRON] Daily Performance Calculation Complete:`);
        console.log(`   - Total Employees: ${result.total}`);
        console.log(`   - Success: ${result.successCount}`);
        console.log(`   - Errors: ${result.errorCount}\n`);
      } catch (error) {
        console.error("❌ [CRON] Daily Performance Calculation Failed:", error);
      }
    });

    console.log(
      "📍 Daily Performance Calculation: Scheduled for 12:05 AM daily",
    );
  }

  /**
   * Daily PIP Check
   * Runs at 1:00 AM to check if any employees need to be put on PIP
   */
  static dailyPIPCheck() {
    cron.schedule("0 1 * * *", async () => {
      try {
        console.log("\n🔄 [CRON] Daily PIP Check Started");
        console.log(`⏰ Time: ${new Date().toLocaleString()}`);

        const result = await PIPService.checkAndTriggerPIPs();

        console.log(`✅ [CRON] Daily PIP Check Complete:`);
        console.log(`   - Employees Checked: ${result.totalChecked}`);
        console.log(`   - New PIPs Triggered: ${result.newPIPs}`);
        console.log(`   - Warnings Sent: ${result.warningsSent}\n`);
      } catch (error) {
        console.error("❌ [CRON] Daily PIP Check Failed:", error);
      }
    });

    console.log("📍 Daily PIP Check: Scheduled for 1:00 AM daily");
  }

  /**
   * Weekly Performance Summary
   * Runs every Monday at 9:00 AM
   */
  static weeklyPerformanceSummary() {
    // 0 9 * * 1 = 9:00 AM every Monday
    cron.schedule("0 9 * * 1", async () => {
      try {
        console.log("\n🔄 [CRON] Weekly Performance Summary Started");
        console.log(`⏰ Time: ${new Date().toLocaleString()}`);

        // TODO: Send weekly performance summary emails to managers
        console.log("📧 Sending weekly performance summaries to managers...");
        // await EmailService.sendWeeklyPerformanceSummaries();

        console.log("✅ [CRON] Weekly Performance Summary Complete\n");
      } catch (error) {
        console.error("❌ [CRON] Weekly Performance Summary Failed:", error);
      }
    });

    console.log(
      "📍 Weekly Performance Summary: Scheduled for 9:00 AM every Monday",
    );
  }

  /**
   * Manual trigger for testing (can be called via API)
   */
  static async runManualCalculation(date = null) {
    console.log("\n🔧 [MANUAL] Running performance calculation manually...");
    const result =
      await PerformanceCalculationService.runDailyCalculation(date);
    console.log("✅ [MANUAL] Manual calculation complete");
    return result;
  }

  /**
   * Manual PIP check for testing
   */
  static async runManualPIPCheck() {
    console.log("\n🔧 [MANUAL] Running PIP check manually...");
    const result = await PIPService.checkAndTriggerPIPs();
    console.log("✅ [MANUAL] Manual PIP check complete");
    return result;
  }
}

module.exports = PerformanceCronJobs;
