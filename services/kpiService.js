const KPIBreakdown = require("../models/KPIBreakdown");
const PerformanceCalculationService = require("./performanceCalculation");
const User = require("../models/User");
const DailyPerformanceRecord = require("../models/DailyPerformanceRecord");
const EmployeeTarget = require("../models/EmployeeTarget");

class KPIService {
  /**
   * Get KPI Breakdown for an employee for a specific month/year
   * @param {string} employeeId 
   * @param {number} month 
   * @param {number} year 
   */
  async getKpiBreakdown(employeeId, month, year) {
    const liveNow = new Date();
    const currentM = liveNow.getMonth() + 1;
    const currentY = liveNow.getFullYear();
    const isCurrentMonth = (currentM === month && currentY === year);

    // Always calculate 'live' rolling averages relative to 'now'
    // For the 'Month' box, we use liveRollingAverages.thisMonth which handles role-specific rules
    const [last7DaysAvg, last30DaysAvg, last90DaysAvg, liveRollingAverages] = await Promise.all([
      this._calculateRollingAverage(employeeId, 7),
      this._calculateRollingAverage(employeeId, 30),
      this._calculateRollingAverage(employeeId, 90),
      PerformanceCalculationService.getRollingAverages(employeeId)
    ]);

    const liveOverview = {
      last7Days: last7DaysAvg,
      last30Days: last30DaysAvg,
      last90Days: last90DaysAvg,
      thisMonth: liveRollingAverages.thisMonth || 0,
    };

    // 1. Get User/Role initially so it's available for all paths
    const user = await User.findById(employeeId);
    if (!user) throw new Error("Employee not found");

    const role = user.role;
    if (!["Sales Person", "Lead Person"].includes(role)) {
      return null;
    }

    if (!isCurrentMonth) {
      const cachedData = await KPIBreakdown.findOne({ employeeId, month, year })
        .populate("employeeId", "fullName email role");
      
      // Only return cache if it actually contains valid targets with target/baseTarget data
      if (cachedData && cachedData.targets && cachedData.targets.length > 0 && 
         (cachedData.targets[0].target !== undefined || cachedData.targets[0].baseTarget !== undefined)) {
        const data = cachedData.toObject();
        // Always show live current-month overview even for past months
        data.averages = liveOverview;

        // Ensure summary has the populated employee info for the frontend
        if (data.summary && !data.summary.employeeId) {
          data.summary.employeeId = data.employeeId;
        }

        // Add liveMonthProgress to cache response if role is Sales Person
        if (role === "Sales Person") {
          const currentM = new Date().getMonth() + 1;
          const currentY = new Date().getFullYear();

          // We calculate a SPECIAL pacing-based score for the live card
          const liveResult = await this._getMonthlyTargets(employeeId, currentM, currentY, role);
          if (liveResult[0]) {
            const item = liveResult[0];
            const pacingTarget = item.expectedTarget || item.target;
            const pacingScore = PerformanceCalculationService.calculateScore(item.actual, pacingTarget);
            
            data.liveMonthProgress = {
              ...item,
              target: pacingTarget,
              score: pacingScore
            };
          }
        }

        return data;
      }
    }

    // 2. Data Not Found or Current Month -> Compute
    // (User and role are already defined above)

    // Get targets for the month
    const targets = await this._getMonthlyTargets(employeeId, month, year, role);

    // Get summary (Overall rating etc.)
    // For current month, we use the pacing-based score from liveRollingAverages
    // For past months, we use the specific monthly score calculated in targets.
    let summaryScore = liveRollingAverages.thisMonth || 0;
    if (!isCurrentMonth && targets.length > 0) {
      summaryScore = targets[0].score || 0;
    }
    
    const summary = await this._getPerformanceSummary(employeeId, month, year, role, summaryScore);

    // Calculate Live Month Progress (Actual vs Expected till today) for Sales Persons
    let liveMonthProgress = null;
    if (role === "Sales Person") {
      // We calculate a SPECIAL pacing-based score for the live card
      const liveResult = await this._getMonthlyTargets(employeeId, currentM, currentY, role);
      if (liveResult[0]) {
        const item = liveResult[0];
        const pacingTarget = item.expectedTarget || item.target;
        const pacingScore = PerformanceCalculationService.calculateScore(item.actual, pacingTarget);
        
        liveMonthProgress = {
          ...item,
          target: pacingTarget,
          score: pacingScore
        };
      }
    }

    // Prepare breakdown data
    const kpiData = {
      employeeId,
      month,
      year,
      role,
      summary,
      averages: liveOverview,
      targets,
      liveMonthProgress
    };


    // 3. Store result in cache if it's a past month
    if (!isCurrentMonth && targets.length > 0) {
      await KPIBreakdown.findOneAndUpdate(
        { employeeId, month, year },
        kpiData,
        { upsert: true, new: true }
      );
    }

    if (targets.length === 0 && !isCurrentMonth) {
      return null; // Trigger "No KPI found"
    }

    return kpiData;
  }

  /**
   * Internal helper to calculate average of daily performance scores for the last N calendar days
   */
  async _calculateRollingAverage(employeeId, days) {
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (days - 1));

    const records = await DailyPerformanceRecord.find({
      employeeId,
      date: { $gte: startDate, $lte: endDate }
    });

    if (records.length === 0) return 0;
    const sum = records.reduce((total, r) => total + r.overallScore, 0);
    return parseFloat((sum / records.length).toFixed(2));
  }

  /**
   * Internal helper to calculate average of daily performance scores for a specific month
   */
  async _calculateMonthAverage(employeeId, month, year) {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const records = await DailyPerformanceRecord.find({
      employeeId,
      date: { $gte: startOfMonth, $lte: endOfMonth }
    });

    if (records.length === 0) return 0;
    const sum = records.reduce((total, r) => total + r.overallScore, 0);
    return parseFloat((sum / records.length).toFixed(2));
  }

  /**
   * Internal helper to format targets/actuals based on role and month
   */
  async _getMonthlyTargets(employeeId, month, year, role) {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    const now = new Date();
    const isCurrentMonth = (now.getMonth() + 1 === month && now.getFullYear() === year);
    const calculationEnd = isCurrentMonth ? now : endOfMonth;

    const targets = await PerformanceCalculationService.getTargetsForPeriod(employeeId, year, month);
    const results = [];

    if (!targets || targets.length === 0) {
      if (isCurrentMonth) return [];

      // Fallback for past months: aggregate from DailyPerformanceRecord
      const dailyRecords = await DailyPerformanceRecord.find({
        employeeId,
        date: { $gte: startOfMonth, $lte: endOfMonth }
      });

      if (dailyRecords.length === 0) return [];

      let totalActual = 0;
      let totalTarget = 0;
      let totalScore = 0;
      let kpiName = role === "Sales Person" ? "Monthly Sales Count" : "Leads Generated (Month)";
      
      dailyRecords.forEach(r => {
        const kpi = r.kpiScores.find(s => 
          role === "Sales Person" ? s.kpiName.match(/Sales/i) : s.kpiName.match(/Leads/i)
        ) || r.kpiScores[0];
        
        if (kpi) {
          totalActual += kpi.actual || 0;
          totalTarget += kpi.target || 0;
          totalScore += kpi.score || 0;
        }
      });

      const score = role === "Sales Person" 
        ? PerformanceCalculationService.calculateScore(totalActual, totalTarget)
        : totalScore / dailyRecords.length;

      results.push({
        kpiId: { kpiName },
        kpiName,
        actual: totalActual,
        target: totalTarget,
        baseTarget: totalTarget,
        score: score,
        status: PerformanceCalculationService.getRatingTier(score)
      });

      return results;
    }

    // Process each target assigned to the employee
    for (const targetDoc of targets) {
      if (role === "Sales Person") {
        const salesTarget = targetDoc.monthlySalesTarget || targetDoc.targets?.target || 0;
        const salesResult = await PerformanceCalculationService.calculateSalesInRange(employeeId, startOfMonth, calculationEnd);
        
        let score = 0;
        let expectedTillToday = 0;

        if (isCurrentMonth) {
          // Current Month: Pacing calculation (Actual / Expected Till Today)
          const totalWorkingDays = await PerformanceCalculationService.getWorkingDaysInMonth(year, month, "Sales Person");
          const dailyExpected = totalWorkingDays > 0 ? salesTarget / totalWorkingDays : 0;
          
          const holidays = await PerformanceCalculationService.fetchHolidays(startOfMonth, calculationEnd);
          const workingDaysPassed = PerformanceCalculationService.getWorkingDays(
            startOfMonth, 
            calculationEnd, 
            holidays.fullDays, 
            holidays.halfDays, 
            "Sales Person"
          );
          expectedTillToday = dailyExpected * workingDaysPassed;
          score = PerformanceCalculationService.calculateScore(salesResult.count, expectedTillToday);
        } else {
          // Past Month: (Actual / Monthly Target)
          score = PerformanceCalculationService.calculateScore(salesResult.count, salesTarget);
        }

        results.push({
          kpiId: targetDoc.kpiId,
          kpiName: targetDoc.kpiId?.kpiName || "Sales Target",
          actual: salesResult.count,
          target: isCurrentMonth ? expectedTillToday : salesTarget,
          baseTarget: salesTarget,
          score: score,
          status: PerformanceCalculationService.getRatingTier(score)
        });
      } else if (role === "Lead Person") {
        const dailyTarget = targetDoc.leadDailyTarget || targetDoc.targets?.target || 0;
        
        if (isCurrentMonth) {
          // For Leads in CURRENT month, show Latest Daily data
          const latestRecord = await DailyPerformanceRecord.findOne({
            employeeId,
            date: { $lte: calculationEnd }
          }).sort({ date: -1 });

          if (latestRecord && latestRecord.kpiScores) {
            const kpiIdStr = targetDoc.kpiId?._id?.toString() || targetDoc.kpiId?.toString();
            const kpiScore = latestRecord.kpiScores.find(s => 
              (s.kpiId && s.kpiId.toString() === kpiIdStr) || 
              (s.kpiName === targetDoc.kpiId?.kpiName)
            );

            if (kpiScore) {
              results.push({
                kpiId: targetDoc.kpiId,
                kpiName: targetDoc.kpiId?.kpiName || "Lead Generation",
                actual: kpiScore.actual,
                target: kpiScore.target,
                baseTarget: dailyTarget,
                score: kpiScore.score,
                status: kpiScore.status
              });
            } else {
              results.push({
                kpiId: targetDoc.kpiId,
                kpiName: targetDoc.kpiId?.kpiName || "Lead Generation",
                actual: 0,
                target: dailyTarget,
                baseTarget: dailyTarget,
                score: 0,
                status: "failing"
              });
            }
          } else {
            results.push({
              kpiId: targetDoc.kpiId,
              kpiName: targetDoc.kpiId?.kpiName || "Lead Generation",
              actual: 0,
              target: dailyTarget,
              baseTarget: dailyTarget,
              score: 0,
              status: "failing"
            });
          }
        } else {
          // For Leads in PAST months, show Monthly average
          const dailyRecords = await DailyPerformanceRecord.find({
            employeeId,
            date: { $gte: startOfMonth, $lte: endOfMonth }
          });

          const kpiIdStr = targetDoc.kpiId?._id?.toString() || targetDoc.kpiId?.toString();
          const relevantScores = dailyRecords.flatMap(r => 
            r.kpiScores.filter(s => 
              (s.kpiId && s.kpiId.toString() === kpiIdStr) || 
              (s.kpiName === targetDoc.kpiId?.kpiName)
            )
          );

          const totalScore = relevantScores.reduce((sum, s) => sum + s.score, 0);
          const totalActual = relevantScores.reduce((sum, s) => sum + s.actual, 0);
          
          const expectedWorkingDays = await PerformanceCalculationService.getWorkingDaysInMonth(year, month, "Lead Person");
          const avgScore = expectedWorkingDays > 0 ? totalScore / expectedWorkingDays : 0;

          results.push({
            kpiId: targetDoc.kpiId,
            kpiName: targetDoc.kpiId?.kpiName || "Lead Generation (Month)",
            actual: totalActual,
            target: dailyTarget * expectedWorkingDays,
            baseTarget: dailyTarget,
            score: avgScore,
            status: PerformanceCalculationService.getRatingTier(avgScore)
          });
        }
      }
    }

    return results;
  }

  /**
   * Internal helper to fetch/compute summary object
   */
  async _getPerformanceSummary(employeeId, month, year, role, currentMonthScore) {
    const user = await User.findById(employeeId).select("fullName email role");
    const dailyRecords = await DailyPerformanceRecord.find({
      employeeId,
      date: { 
        $gte: new Date(year, month - 1, 1), 
        $lte: new Date(year, month, 0, 23, 59, 59, 999) 
      }
    }).sort({ date: -1 });

    const streak = PerformanceCalculationService.calculateStreak(dailyRecords);
    
    return {
      employeeId: user,
      currentRating: currentMonthScore || 0,
      ratingTier: PerformanceCalculationService.getRatingTier(currentMonthScore),
      stars: PerformanceCalculationService.getStars(currentMonthScore),
      streak: streak
    };
  }
}

module.exports = new KPIService();
