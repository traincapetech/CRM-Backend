const mongoose = require("mongoose");
const KPIDefinition = require("../models/KPIDefinition");
const EmployeeTarget = require("../models/EmployeeTarget");
const DailyPerformanceRecord = require("../models/DailyPerformanceRecord");
const MonthlyPerformanceRecord = require("../models/MonthlyPerformanceRecord");
const PerformanceSummary = require("../models/PerformanceSummary");
const Lead = require("../models/Lead");
const Sale = require("../models/Sale");
const User = require("../models/User");
const Attendance = require("../models/Attendance");
const Holiday = require("../models/Holiday");

/**
 * Performance Calculation Service
 * Handles automated calculation of employee performance scores
 */

class PerformanceCalculationService {
  /**
   * Calculate score capped at 100%
   * @param {number} actual
   * @param {number} target
   * @returns {number} Score (0-100)
   */
  static calculateScore(actual, target) {
    if (!target || target <= 0) return 0;
    const score = (actual / target) * 100;
    return Math.min(100, Math.max(0, score));
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
   * Fetch holidays for a date range
   */
  static async fetchHolidays(start, end) {
    const holidays = await Holiday.find({
      date: { $gte: start, $lte: end },
    });

    return {
      fullDays: holidays
        .filter((h) => h.type === "full-day")
        .map((h) => h.date.toISOString().split("T")[0]),
      halfDays: holidays
        .filter((h) => h.type === "half-day")
        .map((h) => h.date.toISOString().split("T")[0]),
    };
  }

  /**
   * Helper to count working days (Mon-Sat), excluding holidays
   * @param {Date} startDate
   * @param {Date} endDate
   * @param {string[]} fullHolidays - Array of YYYY-MM-DD
   * @param {string[]} halfHolidays - Array of YYYY-MM-DD
   * @param {string} role - Role affects half-day calculation
   */
  static getWorkingDays(
    startDate,
    endDate,
    fullHolidays = [],
    halfHolidays = [],
    role = "Lead Person",
  ) {
    let count = 0;
    const curDate = new Date(startDate.getTime());
    while (curDate <= endDate) {
      const dayOfWeek = curDate.getDay(); // 0 = Sunday
      const dateStr = curDate.toISOString().split("T")[0];

      if (dayOfWeek !== 0 && !fullHolidays.includes(dateStr)) {
        if (halfHolidays.includes(dateStr)) {
          // Half-day holiday: Lead Person gets 0.5 reduction, Sales Person gets 0 (full day)
          count += role === "Lead Person" ? 0.5 : 1;
        } else {
          count += 1;
        }
      }
      curDate.setDate(curDate.getDate() + 1);
    }
    return count;
  }

  /**
   * Get total working days in a calendar month
   */
  static async getWorkingDaysInMonth(year, month, role) {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0); // Last day of month
    const holidays = await this.fetchHolidays(startOfMonth, endOfMonth);
    return this.getWorkingDays(
      startOfMonth,
      endOfMonth,
      holidays.fullDays,
      holidays.halfDays,
      role,
    );
  }

  /**
   * Get the pacing ratio (elapsed working / total working duration) for prorated goals.
   * e.g., On Day 15 of a 30-day month, ratio represents 13 working days / 26 total working days.
   * This prevents employees from "failing" mid-period and doesn't penalize them for Sundays or Holidays.
   */
  static getPacingRatio(date, frequency, holidays = []) {
    if (frequency === "daily") return 1;

    const { start, end } = this.getDateRange(date, frequency);

    // Total working days in the period (excluding Sundays and Holidays)
    const totalWorkingDays = this.getWorkingDays(start, end, holidays);
    if (totalWorkingDays === 0) return 1; // Prevent division by zero

    // Elapsed duration from start to the current date (end of the specific day)
    const currentEnd = new Date(date);
    currentEnd.setHours(23, 59, 59, 999);

    // If the calculation date is past the end of the period, cap at 1
    if (currentEnd.getTime() >= end.getTime()) return 1;

    const elapsedWorkingDays = this.getWorkingDays(start, currentEnd, holidays);

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
  static async calculateLeads(userId, date, frequency, customEnd = null) {
    let { start, end } = frequency === "custom" ? { start: date, end: customEnd } : this.getDateRange(date, frequency);

    // Count leads that were CREATED by/for this user today
    // This tracks "New Leads Generated" strictly
    // Removed assignedTo to prevent counting leads just assigned for calling
    const query = {
      $or: [{ createdBy: userId }, { leadPerson: userId }],
      createdAt: {
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
  static async calculateSales(userId, date, frequency, customEnd = null) {
    let { start, end } = frequency === "custom" ? { start: date, end: customEnd } : this.getDateRange(date, frequency);

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

  /**
   * Overloaded calculateSales for custom range
   */
  static async calculateSalesInRange(userId, start, end) {
    const query = {
      salesPerson: userId,
      date: {
        $gte: start,
        $lte: end,
      },
      status: {
        $in: ["closed", "Completed", "completed", "Pending", "pending"],
      },
    };

    const sales = await Sale.find(query);
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
   * Fetch all active EmployeeTargets for a specific month
   */
  static async getTargetsForPeriod(employeeId, year, month) {
    const periodKey = `${year}-${month.toString().padStart(2, "0")}`;
    return await EmployeeTarget.find({
      employeeId,
      "period.periodKey": periodKey,
    }).populate("kpiId");
  }

  /**
   * Calculate performance for Lead Person
   */
  static async calculateLeadPersonPerformance(employee, target, date) {
    const dateKey = date.toISOString().split("T")[0];
    const holidays = await this.fetchHolidays(date, date);

    // 1. Daily Performance
    const isHalfDay = holidays.halfDays.includes(dateKey);
    const dailyTarget = (target?.leadDailyTarget || target?.targets?.target || 0) * (isHalfDay ? 0.5 : 1);
    const leadsToday = await this.calculateLeads(employee._id, date, "daily");
    const dailyScore = this.calculateScore(leadsToday, dailyTarget);

    // Get the KPI ID and Name for matching
    let kpiId = target?.kpiId?._id || target?.kpiId;
    let kpiName = "Leads Generated";
    
    if (target?.kpiId?.kpiName) {
      kpiName = target.kpiId.kpiName;
    } else {
      const kpiDef = await KPIDefinition.findOne({ role: "Lead Person", kpiName: /Leads/i });
      if (kpiDef) {
        kpiId = kpiDef._id;
        kpiName = kpiDef.kpiName;
      }
    }

    return {
      kpiScores: [
        {
          kpiId,
          kpiName,
          target: dailyTarget,
          actual: leadsToday,
          score: dailyScore,
          status: this.getRatingTier(dailyScore),
          weight: 100,
        },
      ],
      overallScore: dailyScore,
    };
  }

  /**
   * Calculate performance for Sales Person
   */
  static async calculateSalesPersonPerformance(employee, target, date) {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed
    const startOfMonth = new Date(year, month, 1);
    const endOfCurrentDay = new Date(date);
    endOfCurrentDay.setHours(23, 59, 59, 999);

    // 1. Get Monthly Target and Working Days
    const monthlyTarget = target?.monthlySalesTarget || target?.targets?.target || 0;
    const totalWorkingDays = await this.getWorkingDaysInMonth(year, month + 1, "Sales Person");
    const dailyExpectedSales = totalWorkingDays > 0 ? monthlyTarget / totalWorkingDays : 0;

    // 2. Calculate Actual Sales Till Date (Cumulative)
    const salesTillDate = await this.calculateSalesInRange(employee._id, startOfMonth, endOfCurrentDay);
    const actualSalesTillDate = salesTillDate.count;

    // 3. Calculate Expected Sales Till Date
    const holidays = await this.fetchHolidays(startOfMonth, endOfCurrentDay);
    const workingDaysPassed = this.getWorkingDays(
      startOfMonth,
      endOfCurrentDay,
      holidays.fullDays,
      holidays.halfDays,
      "Sales Person",
    );
    const expectedSalesTillDate = dailyExpectedSales * workingDaysPassed;

    // 4. Calculate Performance % (Capped at 100%)
    const performanceScore = this.calculateScore(actualSalesTillDate, expectedSalesTillDate);

    // Get the KPI ID and Name for matching
    let kpiId = target?.kpiId?._id || target?.kpiId;
    let kpiName = "Sales Closed";
    
    if (target?.kpiId?.kpiName) {
      kpiName = target.kpiId.kpiName;
    } else {
      const kpiDef = await KPIDefinition.findOne({ role: "Sales Person", kpiName: /Sales/i });
      if (kpiDef) {
        kpiId = kpiDef._id;
        kpiName = kpiDef.kpiName;
      }
    }

    return {
      kpiScores: [
        {
          kpiId,
          kpiName,
          target: expectedSalesTillDate,
          actual: actualSalesTillDate,
          score: performanceScore,
          status: this.getRatingTier(performanceScore),
          weight: 100,
        },
      ],
      overallScore: performanceScore,
    };
  }

  /**
   * Calculate performance for a single employee on a specific date
   */
  static async calculateEmployeePerformance(employeeId, date) {
    try {
      const employee = await User.findById(employeeId);
      if (!employee || !employee.active) return;

      const dateKey = date.toISOString().split("T")[0];
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Skip Sundays
      if (date.getDay() === 0) return;

      // Skip full-day holidays
      const holidayRecord = await Holiday.findOne({
        date: { $gte: startOfDay, $lte: endOfDay },
        type: "full-day",
      });
      if (holidayRecord) return;

      // Skip if absent
      const attendanceRecord = await Attendance.findOne({
        userId: employeeId,
        date: { $gte: startOfDay, $lte: endOfDay },
      });
      if (attendanceRecord && attendanceRecord.status === "ABSENT") return;

      // Get ALL targets for the month
      const targets = await this.getTargetsForPeriod(
        employeeId,
        date.getFullYear(),
        date.getMonth() + 1,
      );

      if (!targets || targets.length === 0) {
        console.log(`No KPI assignments found for ${employee.fullName} for this period. Resetting summary.`);
        // Reset performance summary if no KPIs are assigned to avoid stale data impacting averages
        await PerformanceSummary.findOneAndUpdate(
          { employeeId },
          { 
            currentRating: 0,
            ratingTier: "poor",
            lastCalculated: new Date(),
            history: [] 
          },
          { upsert: false }
        );
        return;
      }

      const allKpiScores = [];
      let totalWeightedScore = 0;
      let totalWeight = 0;

      for (const target of targets) {
        let performanceResult;
        if (employee.role === "Lead Person") {
          performanceResult = await this.calculateLeadPersonPerformance(
            employee,
            target,
            date,
          );
        } else if (employee.role === "Sales Person") {
          performanceResult = await this.calculateSalesPersonPerformance(
            employee,
            target,
            date,
          );
        } else {
          continue;
        }

        if (performanceResult && performanceResult.kpiScores) {
          const weight = target.kpiId?.weight || 100;
          const kpiScore = performanceResult.overallScore;

          allKpiScores.push(...performanceResult.kpiScores);
          totalWeightedScore += kpiScore * weight;
          totalWeight += weight;
        }
      }

      if (allKpiScores.length === 0) return;

      const overallScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
      const rating = this.getRatingTier(overallScore);
      const stars = this.getStars(overallScore);

      // Save/Update Daily record
      await DailyPerformanceRecord.findOneAndUpdate(
        { employeeId, dateKey },
        {
          $set: {
            employeeId,
            date,
            dateKey,
            kpiScores: allKpiScores,
            overallScore,
            rating,
            stars,
            isAutomated: true,
            calculatedAt: new Date(),
          },
        },
        { upsert: true, new: true },
      );

      console.log(
        `✅ Calculated multi-KPI performance for ${employee.fullName}: ${overallScore.toFixed(1)}% (${allKpiScores.length} KPIs)`,
      );

      // Update summary (rolling stats)
      await this.updatePerformanceSummary(employeeId);

      return { employeeId, overallScore, rating, stars };
    } catch (error) {
      console.error(`❌ Error calculating performance for ${employeeId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate rolling averages on the fly
   * @param {string} employeeId 
   * @returns {object} { last7Days, last30Days, last90Days, thisMonth, previousMonth }
   */
  static async getRollingAverages(employeeId) {
    try {
      const User = require("../models/User");
      const DailyPerformanceRecord = require("../models/DailyPerformanceRecord");

      const employee = await User.findById(employeeId);
      if (!employee) return {};

      const now = new Date();
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 29);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(now.getDate() - 89);
      ninetyDaysAgo.setHours(0, 0, 0, 0);

      const getAvg = (records, expectedWorkingDays) => {
        if (expectedWorkingDays <= 0) return 0;
        const totalScore = records.reduce((sum, r) => sum + r.overallScore, 0);
        return parseFloat((totalScore / expectedWorkingDays).toFixed(2));
      };

      const fetchRollingStats = async (startDate, endDate) => {
        const holidays = await this.fetchHolidays(startDate, endDate);
        return this.getWorkingDays(
          startDate,
          endDate,
          holidays.fullDays,
          holidays.halfDays,
          employee.role,
        );
      };

      const [expected7, expected30, expected90] = await Promise.all([
        fetchRollingStats(sevenDaysAgo, todayEnd),
        fetchRollingStats(thirtyDaysAgo, todayEnd),
        fetchRollingStats(ninetyDaysAgo, todayEnd),
      ]);

      const fetchAggregatePerformance = async (startDate, endDate, expectedDays) => {
        const targets = await this.getTargetsForPeriod(employeeId, endDate.getFullYear(), endDate.getMonth() + 1);
        const target = targets.length > 0 ? targets[0] : null; // Fallback to first target for aggregate stats
        let dailyTarget = 0;

        if (employee.role === "Sales Person") {
          const sales = await this.calculateSales(employeeId, startDate, "custom", endDate);
          const monthlyTarget = target?.monthlySalesTarget || target?.targets?.target || 0;
          const totalWorkingInMonth = await this.getWorkingDaysInMonth(endDate.getFullYear(), endDate.getMonth() + 1, "Sales Person");
          dailyTarget = totalWorkingInMonth > 0 ? (monthlyTarget / totalWorkingInMonth) : 0;
          return this.calculateScore(sales.count, dailyTarget * expectedDays);
        } else {
          // Lead Person or fallback
          const leads = await this.calculateLeads(employeeId, startDate, "custom", endDate);
          dailyTarget = target?.leadDailyTarget || target?.targets?.target || 0;
          return this.calculateScore(leads, dailyTarget * expectedDays);
        }
      };

      const calcMonthAvg = async (targetDate) => {
        const y = targetDate.getFullYear();
        const m = targetDate.getMonth() + 1;
        const startOfMonth = new Date(y, m - 1, 1);
        let endOfPeriod;
        if (y === now.getFullYear() && m === now.getMonth() + 1) {
          endOfPeriod = new Date(now);
        } else {
          endOfPeriod = new Date(y, m, 0, 23, 59, 59, 999);
        }

        if (employee.role === "Sales Person") {
          const sales = await this.calculateSales(employeeId, startOfMonth, "custom", endOfPeriod);
          const targets = await this.getTargetsForPeriod(employeeId, y, m);
          const target = targets.length > 0 ? targets[0] : null;
          const monthlyTarget = target?.monthlySalesTarget || target?.targets?.target || 0;
          
          const totalWorkingDays = await this.getWorkingDaysInMonth(y, m, "Sales Person");
          const dailyExpected = totalWorkingDays > 0 ? monthlyTarget / totalWorkingDays : 0;

          const holidays = await this.fetchHolidays(startOfMonth, endOfPeriod);
          const workingDaysPassed = this.getWorkingDays(
            startOfMonth,
            endOfPeriod,
            holidays.fullDays,
            holidays.halfDays,
            "Sales Person",
          );

          return this.calculateScore(sales.count, dailyExpected * workingDaysPassed);
        } else {
          const records = await DailyPerformanceRecord.find({
            employeeId,
            date: { $gte: startOfMonth, $lte: endOfPeriod },
          });
          const expectedDays = await this.getWorkingDaysInMonth(y, m, employee.role);
          return getAvg(records, expectedDays);
        }
      };

      const [avg7, avg30, avg90, thisMonthAvg, previousMonthAvg] = await Promise.all([
        fetchAggregatePerformance(sevenDaysAgo, todayEnd, expected7),
        fetchAggregatePerformance(thirtyDaysAgo, todayEnd, expected30),
        fetchAggregatePerformance(ninetyDaysAgo, todayEnd, expected90),
        calcMonthAvg(now),
        calcMonthAvg(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      ]);

      return {
        last7Days: avg7,
        last30Days: avg30,
        last90Days: avg90,
        thisMonth: thisMonthAvg,
        previousMonth: previousMonthAvg,
      };
    } catch (err) {
      console.error("Error calculating rolling averages:", err);
      return {
        last7Days: 0,
        last30Days: 0,
        last90Days: 0,
        thisMonth: 0,
        previousMonth: 0,
      };
    }
  }

  /**
   * Update performance summary with rolling averages
   * @param {string} employeeId - Employee ID
   */
  static async updatePerformanceSummary(employeeId) {
    try {
      // 1. Get dynamically calculated averages
      const averages = await this.getRollingAverages(employeeId);

      // 2. Extract current month's rating for summary snapshots
      const currentRating = averages.thisMonth;
      const ratingTier = this.getRatingTier(currentRating);
      const stars = this.getStars(currentRating);

      // 3. Get streak from last 30 days records
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const last30Records = await DailyPerformanceRecord.find({
        employeeId,
        date: { $gte: thirtyDaysAgo },
      }).sort({ date: -1 });
      
      const streak = this.calculateStreak(last30Records);

      // 4. PIP Check
      const isPIP = currentRating < 50;
      let pipDetails = null;

      if (isPIP) {
        let pipReason = "Overall low performance";
        if (last30Records.length > 0) {
          const latestRecord = last30Records[0];
          if (latestRecord.kpiScores && latestRecord.kpiScores.length > 0) {
            const failingKPIs = latestRecord.kpiScores
              .filter((kpi) => kpi.score < 60)
              .sort((a, b) => a.score - b.score);

            if (failingKPIs.length > 0) {
              pipReason = `Failing expected target for: ${failingKPIs[0].kpiName}`;
            }
          }
        }

        const existingSummary = await PerformanceSummary.findOne({ employeeId });
        let endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);

        if (existingSummary && existingSummary.isPIP && existingSummary.pipDetails?.endDate) {
          pipDetails = existingSummary.pipDetails;
        } else {
          pipDetails = {
            startDate: new Date(),
            endDate,
            reason: pipReason,
          };
        }
      }

      // 5. Update summary (OMIT 'averages' field as per user request)
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
   * Finalize performance for a month and write to MonthlyPerformanceRecord
   */
  static async finalizeMonthlyRecord(employeeId, year, month) {
    try {
      const employee = await User.findById(employeeId);
      if (!employee) return;

      const periodKey = `${year}-${month.toString().padStart(2, "0")}`;
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

      // 1. Get Target
      const target = await this.getTargetForPeriod(employeeId, year, month);

      // 2. Fetch Totals
      let actualLeads = 0;
      let actualSales = 0;
      let targetLeads = 0;
      let minimumLeads = 0;
      let targetSales = 0;
      let workingDays = 0;

      if (employee.role === "Lead Person") {
        actualLeads = await this.calculateLeads(employeeId, startOfMonth, "monthly");
        workingDays = await this.getWorkingDaysInMonth(year, month, "Lead Person");
        const baseDailyTarget = target?.leadDailyTarget || target?.targets?.target || 0;
        const baseMinDailyTarget = target?.leadMinimumDailyTarget || target?.targets?.minimum || 0;
        targetLeads = baseDailyTarget * workingDays;
        minimumLeads = baseMinDailyTarget * workingDays;
      } else if (employee.role === "Sales Person") {
        const salesRes = await this.calculateSales(employeeId, startOfMonth, "monthly");
        actualSales = salesRes.count;
        targetSales = target?.monthlySalesTarget || target?.targets?.target || 0;
        workingDays = await this.getWorkingDaysInMonth(year, month, "Sales Person");
      }

      // 3. Calculate Score
      const monthlyScore =
        employee.role === "Lead Person"
          ? this.calculateScore(actualLeads, targetLeads)
          : this.calculateScore(actualSales, targetSales);

      const ratingTier = this.getRatingTier(monthlyScore);
      const stars = this.getStars(monthlyScore);

      // 4. Upsert Monthly record
      const record = await MonthlyPerformanceRecord.findOneAndUpdate(
        { employeeId, periodKey },
        {
          employeeId,
          year,
          month,
          periodKey,
          role: employee.role,
          actualLeads,
          targetLeads,
          minimumLeads,
          actualSales,
          targetSales,
          workingDays,
          monthlyScore,
          ratingTier,
          stars,
          updatedAt: new Date(),
        },
        { upsert: true, new: true },
      );

      console.log(`📊 Finalized month ${periodKey} for ${employee.fullName}: ${monthlyScore.toFixed(1)}%`);
      return record;
    } catch (error) {
      console.error(`❌ Error finalizing record for ${employeeId}:`, error);
      throw error;
    }
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

      // Skip fully if today is a full-day holiday
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const todayHoliday = await Holiday.findOne({
        date: { $gte: startOfDay, $lte: endOfDay },
        type: "full-day",
      });

      if (todayHoliday) {
        console.log(
          `🎉 Skipping calculation for entire workforce — Holiday: ${todayHoliday.name}`,
        );
        return { successCount: 0, errorCount: 0, total: 0, skippedReason: "holiday" };
      }

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

  /**
   * Initialize KPI targets for all active employees for a given month
   * @param {number} month - Month (1-12)
   * @param {number} year - Year (YYYY)
   */
  static async initializeMonthlyTargets(month, year) {
    try {
      console.log(`\n📅 Initializing Monthly Targets for ${year}-${month.toString().padStart(2, "0")}...`);
      const periodKey = `${year}-${month.toString().padStart(2, "0")}`;
      const startDate = new Date(year, month - 1, 1).toISOString().split("T")[0];
      const endDate = new Date(year, month, 0).toISOString().split("T")[0];

      // 1. Get all active KPI templates
      const kpis = await KPIDefinition.find({ isActive: true });
      console.log(`   - Found ${kpis.length} active KPI templates.`);

      let createdCount = 0;
      let updatedCount = 0;

      for (const kpi of kpis) {
        // 2. Optimization: Instead of finding ALL employees by role, 
        // find employees who ALREADY have this KPI assigned in previous periods.
        // This prevents auto-assigning manual KPIs to the entire workforce.
        const previouslyAssigned = await EmployeeTarget.find({ kpiId: kpi._id }).distinct("employeeId");
        
        // Find active employees from that list
        const employees = await User.find({
          _id: { $in: previouslyAssigned },
          active: true
        });

        for (const employee of employees) {
          const targetData = {
            employeeId: employee._id,
            kpiId: kpi._id,
            period: {
              startDate,
              endDate,
              periodKey
            },
            targets: {
              minimum: kpi.thresholds.minimum,
              target: kpi.thresholds.target,
              excellent: kpi.thresholds.excellent
            },
            leadDailyTarget: kpi.thresholds.leadDailyTarget || (kpi.role === "Lead Person" ? kpi.thresholds.target : 0),
            leadMinimumDailyTarget: kpi.thresholds.leadMinimumDailyTarget || (kpi.role === "Lead Person" ? kpi.thresholds.minimum : 0),
            monthlySalesTarget: kpi.thresholds.monthlySalesTarget || (kpi.role === "Sales Person" ? kpi.thresholds.target : 0),
          };

          // 3. Upsert EmployeeTarget
          const result = await EmployeeTarget.findOneAndUpdate(
            {
              employeeId: employee._id,
              kpiId: kpi._id,
              "period.periodKey": periodKey
            },
            targetData,
            { upsert: true, new: true, rawResult: true }
          );

          if (result.lastErrorObject.updatedExisting) {
            updatedCount++;
          } else {
            createdCount++;
          }
        }
      }

      console.log(`✅ Monthly target initialization complete: ${createdCount} created, ${updatedCount} updated.\n`);
      return { createdCount, updatedCount };
    } catch (error) {
      console.error("❌ Error initializing monthly targets:", error);
      throw error;
    }
  }

  /**
   * Sync all active targets for a specific KPI across all employees for the current month
   * @param {string} kpiId - ID of the KPI template
   */
  static async syncActiveTargets(kpiId) {
    try {
      const kpi = await KPIDefinition.findById(kpiId);
      if (!kpi) throw new Error("KPI template not found");

      const now = new Date();
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const updateData = {
        "targets.minimum": kpi.thresholds.minimum,
        "targets.target": kpi.thresholds.target,
        "targets.excellent": kpi.thresholds.excellent,
        leadDailyTarget: kpi.thresholds.leadDailyTarget || (kpi.role === "Lead Person" ? kpi.thresholds.target : 0),
        leadMinimumDailyTarget: kpi.thresholds.leadMinimumDailyTarget || (kpi.role === "Lead Person" ? kpi.thresholds.minimum : 0),
        monthlySalesTarget: kpi.thresholds.monthlySalesTarget || (kpi.role === "Sales Person" ? kpi.thresholds.target : 0),
      };

      const result = await EmployeeTarget.updateMany(
        {
          kpiId: kpi._id,
          "period.periodKey": periodKey
        },
        { $set: updateData }
      );

      console.log(`🔄 Synced KPI "${kpi.kpiName}" to ${result.modifiedCount} active employee targets.`);
      return result.modifiedCount;
    } catch (error) {
      console.error(`❌ Error syncing targets for KPI ${kpiId}:`, error);
      throw error;
    }
  }
}

module.exports = PerformanceCalculationService;
