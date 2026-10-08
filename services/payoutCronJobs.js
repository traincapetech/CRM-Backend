const cron = require("node-cron");
const Payroll = require("../models/Payroll");
const { notifyAdmins } = require("./notificationService");

class PayoutCronJobs {
  static startAll() {
    console.log("\n📅 Initializing Payout Scheduling & Due Date Cron Jobs...\n");
    this.scheduleDueDayReminder();
    this.scheduleOverdueReminder();
    console.log("✅ Payout cron jobs scheduled successfully\n");
  }

  /**
   * Daily 9:00 AM check
   * On the 10th of every month: Alerts Admins that previous month's salary is due today!
   * E.g. On 10 October, alerts that September salary is due.
   */
  static scheduleDueDayReminder() {
    cron.schedule("0 9 * * *", async () => {
      try {
        const now = new Date();
        const dayOfMonth = now.getDate();

        // Check if today is the 10th of the month
        if (dayOfMonth === 10) {
          console.log("\n🔄 [PAYOUT CRON] 10th of Month Salary Due Check Triggered");

          const currentMonth = now.getMonth() + 1; // 1-12
          const currentYear = now.getFullYear();

          const dueMonth = currentMonth === 1 ? 12 : currentMonth - 1;
          const dueYear = currentMonth === 1 ? currentYear - 1 : currentYear;

          const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
          ];
          const dueMonthName = monthNames[dueMonth - 1];

          // Find approved records for due month
          const records = await Payroll.find({
            month: dueMonth,
            year: dueYear,
            status: "APPROVED"
          });

          let unpaidCount = 0;
          let totalUnpaidAmount = 0;

          records.forEach(rec => {
            const netExclInc = rec.netSalaryExceptIncentives != null 
              ? rec.netSalaryExceptIncentives 
              : Math.max(0, (rec.netSalary || 0) - (rec.performanceBonus || 0) - (rec.projectBonus || 0));
            const salaryPaid = rec.salaryPaid?.amount || 0;
            const remaining = Math.max(0, netExclInc - salaryPaid);

            if (remaining > 0) {
              unpaidCount++;
              totalUnpaidAmount += remaining;
            }
          });

          if (unpaidCount > 0) {
            console.log(`📢 [PAYOUT CRON] ${dueMonthName} ${dueYear} salary is due today: ${unpaidCount} employees, ₹${totalUnpaidAmount}`);

            await notifyAdmins({
              type: "SALARY_DUE_TODAY",
              message: `📢 Salary Due Today: ${dueMonthName} ${dueYear} salary is due for disbursement today (10th). ${unpaidCount} approved employee(s) pending (Total: ₹${totalUnpaidAmount.toLocaleString('en-IN')}). Please review and run Payout Batch.`
            });
          } else {
            console.log(`✅ [PAYOUT CRON] All approved salaries for ${dueMonthName} ${dueYear} are already disbursed.`);
          }
        }
      } catch (error) {
        console.error("❌ [PAYOUT CRON] Due day reminder check failed:", error);
      }
    });
  }

  /**
   * Overdue reminder on the 12th and 15th of the month
   * Alerts if any approved salary from the 10th remains unpaid
   */
  static scheduleOverdueReminder() {
    cron.schedule("0 9 12,15 * *", async () => {
      try {
        console.log("\n🔄 [PAYOUT CRON] Salary Overdue Check Triggered");
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        const dueMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        const dueYear = currentMonth === 1 ? currentYear - 1 : currentYear;

        const monthNames = [
          "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"
        ];
        const dueMonthName = monthNames[dueMonth - 1];

        const records = await Payroll.find({
          month: dueMonth,
          year: dueYear,
          status: "APPROVED"
        });

        let overdueCount = 0;
        let totalOverdueAmount = 0;

        records.forEach(rec => {
          const netExclInc = rec.netSalaryExceptIncentives != null 
            ? rec.netSalaryExceptIncentives 
            : Math.max(0, (rec.netSalary || 0) - (rec.performanceBonus || 0) - (rec.projectBonus || 0));
          const salaryPaid = rec.salaryPaid?.amount || 0;
          const remaining = Math.max(0, netExclInc - salaryPaid);

          if (remaining > 0) {
            overdueCount++;
            totalOverdueAmount += remaining;
          }
        });

        if (overdueCount > 0) {
          console.warn(`⚠️ [PAYOUT CRON] Overdue salary warning for ${dueMonthName} ${dueYear}: ${overdueCount} employees`);
          await notifyAdmins({
            type: "SALARY_OVERDUE",
            message: `⚠️ Overdue Salary Reminder: ${dueMonthName} ${dueYear} salary was due on the 10th. ${overdueCount} employee(s) still pending disbursement (Total: ₹${totalOverdueAmount.toLocaleString('en-IN')}). Please run payout.`
          });
        }
      } catch (error) {
        console.error("❌ [PAYOUT CRON] Overdue check failed:", error);
      }
    });
  }
}

module.exports = PayoutCronJobs;
