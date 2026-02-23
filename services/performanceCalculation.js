const mongoose = require("mongoose");
const KPIDefinition = require("../models/KPIDefinition");
const EmployeeTarget = require("../models/EmployeeTarget");
const DailyPerformanceRecord = require("../models/DailyPerformanceRecord");
const PerformanceSummary = require("../models/PerformanceSummary");
const Lead = require("../models/Lead");
const Sale = require("../models/Sale");
const User = require("../models/User");
const Attendance = require("../models/Attendance");

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
  /**
   * Get date range helpers
   */
  static getDateRange(date, frequency) {
    const start = new Date(date);
    const end = new Date(date);

    if (frequency === "daily") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (frequency === "weekly") {
      const day = start.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diffToMonday);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (frequency === "monthly") {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    } else if (frequency === "quarterly") {
      const quarter = Math.floor(start.getMonth() / 3);
      start.setMonth(quarter * 3, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(quarter * 3 + 3, 0);
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  }

  /**
   * Helper to count working days (Mon-Sat) between two dates inclusive
   */
  static getWorkingDays(startDate, endDate) {
    let count = 0;
    const curDate = new Date(startDate.getTime());
    while (curDate <= endDate) {
      const dayOfWeek = curDate.getDay();
      if (dayOfWeek !== 0) {
        // 0 is Sunday
        count++;
      }
      curDate.setDate(curDate.getDate() + 1);
    }
    return count;
  }

  /**
   * Get the pacing ratio (elapsed working / total working duration) for prorated goals.
   * e.g., On Day 15 of a 30-day month, ratio represents 13 working days / 26 total working days.
   * This prevents employees from "failing" mid-period and doesn't penalize them for Sundays.
   */
  static getPacingRatio(date, frequency) {
    if (frequency === "daily") return 1;

    const { start, end } = this.getDateRange(date, frequency);

    // Total working days in the period
    const totalWorkingDays = this.getWorkingDays(start, end);
    if (totalWorkingDays === 0) return 1; // Prevent division by zero

    // Elapsed duration from start to the current date (end of the specific day)
    const currentEnd = new Date(date);
    currentEnd.setHours(23, 59, 59, 999);

    // If the calculation date is past the end of the period, cap at 1
    if (currentEnd.getTime() >= end.getTime()) return 1;

    const elapsedWorkingDays = this.getWorkingDays(start, currentEnd);

    // For safety, ensure it's between >0 and <= 1
    const ratio = Math.max(
      0.01,
      Math.min(1, elapsedWorkingDays / totalWorkingDays),
    );
    return ratio;
  }

  /**
   * Calculate leads count for any frequency period
   * @param {string} userId - User ID
   * @param {Date} date - Reference date
   * @param {string} frequency - daily, weekly, monthly, quarterly
   * @returns {number} Number of leads
   */
  static async calculateLeads(userId, date, frequency) {
    const { start, end } = this.getDateRange(date, frequency);

    const query = {
      $or: [
        { createdBy: userId },
        { assignedTo: userId },
        { leadPerson: userId },
      ],
      updatedAt: {
        $gte: start,
        $lte: end,
      },
    };

    return await Lead.countDocuments(query);
  }

  /**
   * Calculate sales for any frequency period
   * @param {string} userId - User ID
   * @param {Date} date - Reference date
   * @param {string} frequency - daily, weekly, monthly, quarterly
   * @returns {object} { count, revenue }
   */
  static async calculateSales(userId, date, frequency) {
    const { start, end } = this.getDateRange(date, frequency);

    const sales = await Sale.find({
      salesPerson: userId,
      date: {
        $gte: start,
        $lte: end,
      },
      status: {
        $in: ["closed", "Completed", "completed", "Pending", "pending"],
      },
    });

    const count = sales.length;
    const revenue = sales.reduce((sum, sale) => sum + (sale.totalCost || 0), 0);

    return { count, revenue };
  }

  // Backward-compatible aliases
  static async calculateDailyLeads(userId, date) {
    return this.calculateLeads(userId, date, "daily");
  }

  static async calculateMonthlySales(userId, date) {
    return this.calculateSales(userId, date, "monthly");
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

      // Check attendance for this day
      // Date matching logic: get the start and end of the specified date
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const attendanceRecord = await Attendance.findOne({
        userId: employeeId,
        date: { $gte: startOfDay, $lte: endOfDay },
      });

      if (attendanceRecord && attendanceRecord.status === "ABSENT") {
        console.log(
          `⏭️ Skipping absentee employee: ${employeeId} on ${dateKey}`,
        );
        return; // Skip daily KPI calculation for absent employees
      }

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
      const EmployeeTarget = require("../models/EmployeeTarget");

      for (const kpi of kpis) {
        let actual = 0;

        // 1. Determine period and fetch custom targets if they exist
        let periodKey = null;
        const range = this.getDateRange(date, kpi.frequency);
        const startDate = range.start;
        const endDate = range.end;

        if (kpi.frequency === "daily") {
          periodKey = dateKey;
        } else if (kpi.frequency === "weekly") {
          const weekStart = startDate.toISOString().split("T")[0];
          periodKey = `${weekStart}-W`;
        } else if (kpi.frequency === "monthly") {
          periodKey = dateKey.substring(0, 7); // 2026-02
        } else if (kpi.frequency === "quarterly") {
          const quarter = Math.floor(startDate.getMonth() / 3) + 1;
          periodKey = `${startDate.getFullYear()}-Q${quarter}`;
        }

        let activeThresholds = kpi.thresholds;
        if (periodKey) {
          const empTarget = await EmployeeTarget.findOne({
            employeeId,
            kpiId: kpi._id,
            "period.periodKey": periodKey,
          });
          if (empTarget && empTarget.targets) {
            activeThresholds = empTarget.targets;
          }
        }

        // 2. Pace (prorate) the targets based on elapsed time
        const ratio = this.getPacingRatio(date, kpi.frequency);
        const pacedThresholds = {
          minimum: activeThresholds.minimum * ratio,
          target: activeThresholds.target * ratio,
          excellent: activeThresholds.excellent * ratio,
        };

        // 3. Get actual value based on data source and frequency
        if (kpi.dataSource.type === "leads") {
          actual = await this.calculateLeads(employeeId, date, kpi.frequency);
        } else if (kpi.dataSource.type === "sales") {
          const { count, revenue } = await this.calculateSales(
            employeeId,
            date,
            kpi.frequency,
          );
          actual =
            kpi.metricType === "amount" || kpi.kpiName.includes("Revenue")
              ? revenue
              : count;
        }
        // For 'manual', 'custom', 'attendance' — actual stays 0, updated manually

        // 4. Calculate score against paced targets
        const score = this.calculateScore(actual, pacedThresholds);

        // 5. Determine status
        let status;
        if (actual >= pacedThresholds.excellent) status = "excellent";
        else if (actual >= pacedThresholds.target) status = "on-track";
        else if (actual >= pacedThresholds.minimum) status = "at-risk";
        else status = "failing";

        kpiScores.push({
          kpiId: kpi._id,
          kpiName: kpi.kpiName,
          target: pacedThresholds.target, // Show the paced target in summaries
          baseTarget: activeThresholds.target, // Keep original target for reference
          actual,
          score,
          status,
          weight: kpi.weight,
        });

        // Sync with EmployeeTarget (Ensure target exists and update actuals)
        try {
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
                  targets: activeThresholds,
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

      // Deduce PIP Status and Reason
      const isPIP = currentRating < 50;
      let pipDetails = null;

      if (isPIP) {
        // Find the worst performing KPI from the latest record
        let pipReason = "Overall low performance";
        if (last30Records.length > 0) {
          // Sort records by date ascending to get the latest record easily
          const sortedRecordsAsc = [...last30Records].sort(
            (a, b) => new Date(a.date) - new Date(b.date),
          );
          const latestRecord = sortedRecordsAsc[sortedRecordsAsc.length - 1]; // Last is the latest
          if (latestRecord.kpiScores && latestRecord.kpiScores.length > 0) {
            const failingKPIs = latestRecord.kpiScores
              .filter((kpi) => kpi.score < 60) // KPIs with score below 60 are considered failing
              .sort((a, b) => a.score - b.score); // Sort by score ascending (worst first)

            if (failingKPIs.length > 0) {
              const worst = failingKPIs[0];
              pipReason = `Failing expected target for: ${worst.kpiName}`;
            }
          }
        }

        // Keep existing endDate if it exists, otherwise set to 30 days from now
        const existingSummary = await PerformanceSummary.findOne({
          employeeId,
        });
        let endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 30);

        if (
          existingSummary &&
          existingSummary.isPIP &&
          existingSummary.pipDetails?.endDate
        ) {
          endDate = existingSummary.pipDetails.endDate;
        }

        pipDetails = {
          startDate: now,
          endDate: endDate,
          reason: pipReason,
        };
      }

      // Update or create summary
      await PerformanceSummary.findOneAndUpdate(
        { employeeId },
        {
          employeeId,
          currentRating,
          ratingTier,
          stars,
          streak,
          isPIP,
          pipDetails,
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
