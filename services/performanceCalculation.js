const mongoose = require("mongoose");
const KPIDefinition = require("../models/KPIDefinition");
const EmployeeTarget = require("../models/EmployeeTarget");
const DailyPerformanceRecord = require("../models/DailyPerformanceRecord");
const PerformanceSummary = require("../models/PerformanceSummary");
const Lead = require("../models/Lead");
const Sale = require("../models/Sale");
const User = require("../models/User");

/**
 * Performance Calculation Service
 * Handles automated calculation of employee performance scores
 */

class PerformanceCalculationService {
  /**
   * Calculate score based on thresholds
   * @param {number} actual - Actual value achieved
   * @param {object} thresholds - { minimum, target, excellent }
   * @returns {number} Score (0-100)
   */
  static calculateScore(actual, thresholds) {
    const { minimum, target, excellent } = thresholds;

    if (actual >= excellent) {
      return 100;
    } else if (actual >= target) {
      // Between target and excellent: 80-100
      const range = excellent - target;
      const progress = actual - target;
      return 80 + (progress / range) * 20;
    } else if (actual >= minimum) {
      // Between minimum and target: 60-80
      const range = target - minimum;
      const progress = actual - minimum;
      return 60 + (progress / range) * 20;
    } else if (actual > 0) {
      // Below minimum but not zero: 0-60
      return (actual / minimum) * 60;
    } else {
      return 0;
    }
  }

  /**
   * Get rating tier from score
   * @param {number} score - Score (0-100)
   * @returns {string} Rating tier
   */
  static getRatingTier(score) {
    if (score >= 90) return "excellent";
    if (score >= 75) return "good";
    if (score >= 60) return "average";
    if (score >= 40) return "below-average";
    return "poor";
  }

  /**
   * Get stars from score
   * @param {number} score - Score (0-100)
   * @returns {number} Stars (1-5)
   */
  static getStars(score) {
    if (score >= 90) return 5;
    if (score >= 75) return 4;
    if (score >= 60) return 3;
    if (score >= 40) return 2;
    return 1;
  }

  /**
   * Calculate daily leads for Lead Person
   * @param {string} userId - User ID
   * @param {Date} date - Date to calculate for
   * @returns {number} Number of leads created
   */
  static async calculateDailyLeads(userId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Count leads that were either created OR updated by/for this user today
    // This tracks "Active Leads" rather than just "New Leads Generated"
    const query = {
      $or: [
        { createdBy: userId },
        { assignedTo: userId },
        { leadPerson: userId },
      ],
      updatedAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    };

    const count = await Lead.countDocuments(query);

    return count;
  }

  /**
   * Calculate monthly sales for Sales Person
   * @param {string} userId - User ID
   * @param {Date} date - Date in the month to calculate
   * @returns {object} { count, revenue }
   */
  static async calculateMonthlySales(userId, date) {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const sales = await Sale.find({
      salesPerson: userId,
      date: {
        $gte: startOfMonth,
        $lte: endOfMonth,
      },
      status: "closed", // Only count closed sales
    });

    const count = sales.length;
    const revenue = sales.reduce((sum, sale) => sum + (sale.totalCost || 0), 0);

    return { count, revenue };
  }

  /**
   * Calculate performance for a single employee on a specific date
   * @param {string} employeeId - Employee ID
   * @param {Date} date - Date to calculate for
   */
  static async calculateEmployeePerformance(employeeId, date) {
    try {
      // Get employee info
      const employee = await User.findById(employeeId);
      if (!employee || !employee.active) {
        console.log(`⏭️ Skipping inactive employee: ${employeeId}`);
        return;
      }

      const dateKey = date.toISOString().split("T")[0]; // YYYY-MM-DD

      // Get active KPIs for this employee's role
      const kpis = await KPIDefinition.find({
        role: employee.role,
        isActive: true,
      });

      if (kpis.length === 0) {
        console.log(`⏭️ No KPIs configured for role: ${employee.role}`);
        return;
      }

      const kpiScores = [];
      let totalWeightedScore = 0;
      let totalWeight = 0;

      // Calculate each KPI
      for (const kpi of kpis) {
        let actual = 0;

        // Get actual value based on data source
        if (kpi.dataSource.type === "leads" && kpi.frequency === "daily") {
          actual = await this.calculateDailyLeads(employeeId, date);
        } else if (
          kpi.dataSource.type === "sales" &&
          kpi.frequency === "monthly"
        ) {
          const { count, revenue } = await this.calculateMonthlySales(
            employeeId,
            date,
          );
          actual = kpi.kpiName.includes("Revenue") ? revenue : count;
        }

        // Calculate score
        const score = this.calculateScore(actual, kpi.thresholds);

        // Determine status
        let status;
        if (actual >= kpi.thresholds.excellent) status = "excellent";
        else if (actual >= kpi.thresholds.target) status = "on-track";
        else if (actual >= kpi.thresholds.minimum) status = "at-risk";
        else status = "failing";

        kpiScores.push({
          kpiId: kpi._id,
          kpiName: kpi.kpiName,
          target: kpi.thresholds.target,
          actual,
          score,
          status,
          weight: kpi.weight,
        });

        // Sync with EmployeeTarget (Ensure target exists and update actuals)
        try {
          let periodKey = null;
          let startDate = new Date(date);
          let endDate = new Date(date);

          if (kpi.frequency === "daily") {
            periodKey = dateKey;
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
          } else if (kpi.frequency === "monthly") {
            periodKey = dateKey.substring(0, 7); // 2026-02
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setDate(0);
            endDate.setHours(23, 59, 59, 999);
          }

          if (periodKey) {
            await EmployeeTarget.findOneAndUpdate(
              {
                employeeId,
                kpiId: kpi._id,
                "period.periodKey": periodKey,
              },
              {
                $set: {
                  actual,
                  score,
                  status,
                  lastCalculated: new Date(),
                },
                $setOnInsert: {
                  employeeId,
                  kpiId: kpi._id,
                  targets: kpi.thresholds,
                  period: {
                    startDate,
                    endDate,
                    periodKey,
                  },
                },
              },
              { upsert: true },
            );
          }
        } catch (targetErr) {
          console.error(`Error updating target: ${targetErr.message}`);
        }

        // Weighted average
        totalWeightedScore += score * kpi.weight;
        totalWeight += kpi.weight;
      }

      // Calculate overall score
      const overallScore =
        totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
      const rating = this.getRatingTier(overallScore);
      const stars = this.getStars(overallScore);

      // Save or update daily performance record
      await DailyPerformanceRecord.findOneAndUpdate(
        { employeeId, dateKey },
        {
          employeeId,
          date,
          dateKey,
          kpiScores,
          overallScore,
          rating,
          stars,
          isAutomated: true,
          calculatedAt: new Date(),
        },
        {
          upsert: true,
          new: true,
        },
      );

      console.log(
        `✅ Calculated performance for ${employee.fullName}: ${overallScore.toFixed(1)}/100 (${stars}⭐)`,
      );

      // Update performance summary
      await this.updatePerformanceSummary(employeeId);

      return { employeeId, overallScore, rating, stars };
    } catch (error) {
      console.error(
        `❌ Error calculating performance for ${employeeId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Update performance summary with rolling averages
   * @param {string} employeeId - Employee ID
   */
  static async updatePerformanceSummary(employeeId) {
    try {
      // Get recent performance records
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 7);

      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);

      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(now.getDate() - 90);

      // Get records
      const last7Records = await DailyPerformanceRecord.find({
        employeeId,
        date: { $gte: sevenDaysAgo },
      });

      const last30Records = await DailyPerformanceRecord.find({
        employeeId,
        date: { $gte: thirtyDaysAgo },
      });

      const last90Records = await DailyPerformanceRecord.find({
        employeeId,
        date: { $gte: ninetyDaysAgo },
      });

      // Calculate averages
      const avg7 =
        last7Records.length > 0
          ? last7Records.reduce((sum, r) => sum + r.overallScore, 0) /
            last7Records.length
          : 0;

      const avg30 =
        last30Records.length > 0
          ? last30Records.reduce((sum, r) => sum + r.overallScore, 0) /
            last30Records.length
          : 0;

      const avg90 =
        last90Records.length > 0
          ? last90Records.reduce((sum, r) => sum + r.overallScore, 0) /
            last90Records.length
          : 0;

      // Current rating is based on 30-day average
      const currentRating = avg30;
      const ratingTier = this.getRatingTier(currentRating);
      const stars = this.getStars(currentRating);

      // Calculate streak
      const streak = this.calculateStreak(last30Records);

      // Update or create summary
      await PerformanceSummary.findOneAndUpdate(
        { employeeId },
        {
          employeeId,
          currentRating,
          ratingTier,
          stars,
          streak,
          averages: {
            last7Days: avg7,
            last30Days: avg30,
            last90Days: avg90,
          },
          lastCalculated: new Date(),
        },
        {
          upsert: true,
          new: true,
        },
      );

      console.log(
        `📊 Updated summary for employee ${employeeId}: ${currentRating.toFixed(1)}/100`,
      );
    } catch (error) {
      console.error(
        `❌ Error updating performance summary for ${employeeId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Calculate performance streak
   * @param {Array} records - Performance records (sorted by date desc)
   * @returns {object} { type, days, description }
   */
  static calculateStreak(records) {
    if (records.length === 0) {
      return { type: "neutral", days: 0, description: "No data" };
    }

    // Sort by date descending
    const sorted = records.sort((a, b) => new Date(b.date) - new Date(a.date));

    let streakDays = 0;
    let streakType = "neutral";

    // Check if above or below 75 (good threshold)
    const firstScore = sorted[0].overallScore;
    const isPositive = firstScore >= 75;

    for (const record of sorted) {
      if (
        (isPositive && record.overallScore >= 75) ||
        (!isPositive && record.overallScore < 75)
      ) {
        streakDays++;
      } else {
        break;
      }
    }

    if (streakDays > 0) {
      streakType = isPositive ? "positive" : "negative";
    }

    const description =
      streakType === "positive"
        ? `${streakDays} days above target`
        : streakType === "negative"
          ? `${streakDays} days below target`
          : "No streak";

    return { type: streakType, days: streakDays, description };
  }

  /**
   * Run daily performance calculation for all active employees
   * @param {Date} date - Date to calculate (defaults to yesterday)
   */
  static async runDailyCalculation(date = null) {
    try {
      // Default to yesterday (since we're running at midnight for yesterday's data)
      if (!date) {
        date = new Date();
        date.setDate(date.getDate() - 1);
      }

      console.log(
        `\n🚀 Starting daily performance calculation for ${date.toDateString()}...`,
      );

      // Get all active employees
      const employees = await User.find({
        active: true,
        role: { $in: ["Lead Person", "Sales Person", "Manager"] },
      });

      console.log(`📊 Found ${employees.length} active employees to process`);

      let successCount = 0;
      let errorCount = 0;

      // Calculate performance for each employee
      for (const employee of employees) {
        try {
          await this.calculateEmployeePerformance(employee._id, date);
          successCount++;
        } catch (error) {
          console.error(`❌ Failed for ${employee.fullName}:`, error.message);
          errorCount++;
        }
      }

      console.log(
        `\n✅ Daily calculation complete: ${successCount} success, ${errorCount} errors`,
      );

      return { successCount, errorCount, total: employees.length };
    } catch (error) {
      console.error("❌ Error in daily calculation:", error);
      throw error;
    }
  }
}

module.exports = PerformanceCalculationService;
