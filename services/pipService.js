const PIP = require("../models/PIP");
const PerformanceSummary = require("../models/PerformanceSummary");
const DailyPerformanceRecord = require("../models/DailyPerformanceRecord");
const User = require("../models/User");
const Employee = require("../models/Employee");

/**
 * PIP (Performance Improvement Plan) Service
 * Handles automatic PIP triggering and management
 */

class PIPService {
  /**
   * Check if an employee meets PIP trigger criteria
   * @param {string} employeeId - Employee ID
   * @returns {object|null} { shouldTrigger, reason, severity } or null
   */
  static async checkPIPCriteria(employeeId) {
    try {
      // Get performance summary
      const summary = await PerformanceSummary.findOne({ employeeId });
      if (!summary) {
        console.log(`Checking ${employeeId}: No summary found`);
        return null;
      }
      console.log(
        `Checking ${employeeId}: 30-day avg = ${summary.averages?.last30Days}, isPIP = ${summary.isPIP}`,
      );

      // Already on PIP? Skip
      if (summary.isPIP) {
        return null;
      }

      // Get last 14 days of performance records
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const recentRecords = await DailyPerformanceRecord.find({
        employeeId,
        date: { $gte: fourteenDaysAgo },
      }).sort({ date: -1 });

      if (recentRecords.length < 7) {
        // Not enough data
        return null;
      }

      // PIP Trigger Rules:
      // 1. Rating < 40 for 7 consecutive days (CRITICAL)
      // 2. Rating < 50 for 14 consecutive days (HIGH)
      // 3. Rating < 60 for 30 days (MEDIUM)

      const last7Records = recentRecords.slice(0, 7);
      const last14Records = recentRecords.slice(0, 14);

      // Check Rule 1: < 40 for 7 days
      const criticalDays = last7Records.filter(
        (r) => r.overallScore < 40,
      ).length;
      if (criticalDays >= 7) {
        return {
          shouldTrigger: true,
          reason: `Performance below 40 for ${criticalDays} consecutive days`,
          severity: "critical",
          avgScore:
            last7Records.reduce((sum, r) => sum + r.overallScore, 0) / 7,
        };
      }

      // Check Rule 2: < 50 for 14 days
      if (last14Records.length >= 14) {
        const highRiskDays = last14Records.filter(
          (r) => r.overallScore < 50,
        ).length;
        if (highRiskDays >= 14) {
          return {
            shouldTrigger: true,
            reason: `Performance below 50 for ${highRiskDays} consecutive days`,
            severity: "high",
            avgScore:
              last14Records.reduce((sum, r) => sum + r.overallScore, 0) / 14,
          };
        }
      }

      // Check Rule 3: < 60 for 30 days (based on 30-day average)
      if (summary.averages.last30Days < 60 && summary.averages.last30Days > 0) {
        return {
          shouldTrigger: true,
          reason: `30-day average performance below 60 (${summary.averages.last30Days.toFixed(1)})`,
          severity: "medium",
          avgScore: summary.averages.last30Days,
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ Error checking PIP criteria for ${employeeId}:`, error);
      return null;
    }
  }

  /**
   * Trigger a new PIP for an employee
   * @param {string} employeeId - Employee ID
   * @param {object} triggerInfo - { reason, severity, avgScore }
   */
  static async triggerPIP(employeeId, triggerInfo) {
    try {
      const employee = await User.findById(employeeId);
      if (!employee) {
        throw new Error("Employee not found");
      }

      // Determine PIP duration based on severity
      let duration = 30; // days
      if (triggerInfo.severity === "critical") duration = 30;
      else if (triggerInfo.severity === "high") duration = 45;
      else if (triggerInfo.severity === "medium") duration = 60;

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + duration);

      // Find manager (fallback to HR or Admin)
      let managerId = employee.managerId;
      if (!managerId) {
        const manager = await User.findOne({
          role: { $in: ["Manager", "HR", "Admin"] },
          active: true,
        });
        managerId = manager?._id;
      }

      // Create PIP document
      const pip = await PIP.create({
        employeeId,
        status: "active",
        triggerReason: triggerInfo.reason,
        isAutomatic: true,
        startDate,
        endDate,
        duration,
        goals: [], // Will be populated by manager
        assignedManager: managerId,
      });

      // Update performance summary
      await PerformanceSummary.findOneAndUpdate(
        { employeeId },
        {
          isPIP: true,
          pipDetails: {
            startDate,
            endDate,
            pipId: pip._id,
          },
        },
      );

      console.log(`🚨 PIP TRIGGERED for ${employee.fullName}`);
      console.log(`   Reason: ${triggerInfo.reason}`);
      console.log(`   Severity: ${triggerInfo.severity}`);
      console.log(`   Duration: ${duration} days`);
      console.log(`   Avg Score: ${triggerInfo.avgScore.toFixed(1)}/100`);

      // Send notification email
      const EmailService = require("./emailService");
      try {
        await EmailService.sendPIPNotification(
          employee,
          pip,
          employee.managerId,
        );
      } catch (emailError) {
        console.error(
          "⚠️ Failed to send PIP notification email:",
          emailError.message,
        );
      }

      return pip;
    } catch (error) {
      console.error(`❌ Error triggering PIP for ${employeeId}:`, error);
      throw error;
    }
  }

  /**
   * Manually issue a PIP by Admin / HR
   * @param {object} params - { employeeId, triggerReason, startDate, endDate, expectations, adminId }
   */
  static async initiateManualPIP({
    employeeId,
    triggerReason,
    startDate,
    endDate,
    expectations,
    adminId,
  }) {
    try {
      // Find by Employee model or User model
      let employeeDoc = await Employee.findById(employeeId);
      let userDoc = null;

      if (employeeDoc) {
        if (employeeDoc.userId) {
          userDoc = await User.findById(employeeDoc.userId);
        }
        if (!userDoc && employeeDoc.email) {
          userDoc = await User.findOne({ email: employeeDoc.email });
        }
      } else {
        userDoc = await User.findById(employeeId);
        if (userDoc) {
          employeeDoc = await Employee.findOne({
            $or: [{ userId: userDoc._id }, { email: userDoc.email }],
          });
        }
      }

      if (!employeeDoc && !userDoc) {
        throw new Error("Employee not found");
      }

      const targetEmail = employeeDoc?.email || userDoc?.email;
      const targetName = employeeDoc?.fullName || userDoc?.fullName || userDoc?.name;
      const targetUserId = userDoc?._id || employeeDoc?.userId || employeeDoc?._id;
      const targetEmployeeId = employeeDoc?._id || targetUserId;

      const start = startDate ? new Date(startDate) : new Date();
      const end = endDate ? new Date(endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Calculate duration in days
      const diffTime = Math.abs(end - start);
      const duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 30;

      // Close any active PIP for this employee
      await PIP.updateMany(
        { $or: [{ employeeId: targetEmployeeId }, { employeeId: targetUserId }], status: "active" },
        { status: "cancelled", "outcome.finalNotes": "Replaced by new manual PIP" }
      );

      // Find manager
      let managerId = employeeDoc?.reportingManager || userDoc?.managerId || adminId;
      if (!managerId) {
        const manager = await User.findOne({
          role: { $in: ["Manager", "HR", "Admin"] },
          active: true,
        });
        managerId = manager?._id;
      }

      // Create new PIP document
      const pip = await PIP.create({
        employeeId: targetEmployeeId,
        status: "active",
        triggerReason: triggerReason || "Sales performance has been below expected targets.",
        isAutomatic: false,
        startDate: start,
        endDate: end,
        duration,
        expectations: Array.isArray(expectations) ? expectations : [],
        assignedManager: managerId,
        hrNotes: `Issued manually by Admin/HR (${adminId})`,
      });

      // Update Employee record
      if (employeeDoc) {
        await Employee.findByIdAndUpdate(employeeDoc._id, {
          status: "PIP",
          isUnderPIP: true,
          pipStartDate: start,
          pipEndDate: end,
        });
      }

      // Update User record
      if (userDoc) {
        await User.findByIdAndUpdate(userDoc._id, {
          isUnderPIP: true,
          pipStartDate: start,
          pipEndDate: end,
        });
      }

      // Update PerformanceSummary
      await PerformanceSummary.findOneAndUpdate(
        { $or: [{ employeeId: targetEmployeeId }, { employeeId: targetUserId }] },
        {
          isPIP: true,
          pipDetails: {
            startDate: start,
            endDate: end,
            pipId: pip._id,
            triggerReason: pip.triggerReason,
          },
        },
        { upsert: true }
      );

      console.log(`🚨 MANUAL PIP ISSUED for ${targetName} (${duration} days)`);

      // Dispatch formal notification email
      const EmailService = require("./emailService");
      try {
        const managerUser = await User.findById(managerId);
        const recipientObj = {
          email: targetEmail,
          fullName: targetName,
          name: targetName,
        };
        await EmailService.sendPIPNotification(recipientObj, pip, managerUser);
      } catch (emailErr) {
        console.error("⚠️ Failed to send PIP notification email:", emailErr.message);
      }

      return pip;
    } catch (error) {
      console.error(`❌ Error issuing manual PIP for ${employeeId}:`, error);
      throw error;
    }
  }

  /**
   * Check all employees and trigger PIPs where needed
   * @returns {object} { totalChecked, newPIPs, warningsSent }
   */
  static async checkAndTriggerPIPs() {
    try {
      console.log("\n🔍 Checking employees for PIP triggers...");

      // Get all active employees
      const employees = await User.find({
        active: true,
        role: { $in: ["Lead Person", "Sales Person", "Manager"] },
      });

      let totalChecked = 0;
      let newPIPs = 0;
      let warningsSent = 0;

      for (const employee of employees) {
        try {
          totalChecked++;

          const pipCriteria = await this.checkPIPCriteria(employee._id);

          if (pipCriteria && pipCriteria.shouldTrigger) {
            // Trigger PIP
            await this.triggerPIP(employee._id, pipCriteria);
            newPIPs++;
          } else if (pipCriteria) {
            // Send warning (approaching PIP territory)
            warningsSent++;
            console.log(
              `⚠️ Warning for ${employee.fullName}: Approaching PIP threshold`,
            );
            // TODO: Send warning email
          }
        } catch (error) {
          console.error(
            `❌ Error processing ${employee.fullName}:`,
            error.message,
          );
        }
      }

      console.log(`\n✅ PIP check complete:`);
      console.log(`   - Checked: ${totalChecked} employees`);
      console.log(`   - New PIPs: ${newPIPs}`);
      console.log(`   - Warnings: ${warningsSent}`);

      return { totalChecked, newPIPs, warningsSent };
    } catch (error) {
      console.error("❌ Error in PIP check:", error);
      throw error;
    }
  }

  /**
   * Update PIP with weekly review
   * @param {string} pipId - PIP ID
   * @param {object} reviewData - { weekNumber, progress, score, notes, managerFeedback }
   * @param {string} reviewerId - Reviewer's user ID
   */
  static async addWeeklyReview(pipId, reviewData, reviewerId) {
    try {
      const pip = await PIP.findById(pipId);
      if (!pip) {
        throw new Error("PIP not found");
      }

      pip.weeklyReviews.push({
        weekNumber: reviewData.weekNumber,
        reviewDate: new Date(),
        reviewerId,
        progress: reviewData.progress,
        score: reviewData.score,
        notes: reviewData.notes,
        managerFeedback: reviewData.managerFeedback,
      });

      await pip.save();

      console.log(
        `📝 Added weekly review #${reviewData.weekNumber} to PIP ${pipId}`,
      );

      return pip;
    } catch (error) {
      console.error("❌ Error adding weekly review:", error);
      throw error;
    }
  }

  /**
   * Close PIP with outcome
   * @param {string} pipId - PIP ID
   * @param {object} outcomeData - { result, finalNotes, finalScore }
   * @param {string} closedBy - User ID who closed the PIP
   */
  static async closePIP(pipId, outcomeData, closedBy) {
    try {
      const pip = await PIP.findById(pipId);
      if (!pip) {
        throw new Error("PIP not found");
      }

      pip.status = `completed-${outcomeData.result}`;
      pip.outcome = {
        result: outcomeData.result,
        closedDate: new Date(),
        closedBy,
        finalNotes: outcomeData.finalNotes,
        finalScore: outcomeData.finalScore,
      };

      await pip.save();

      // Update performance summary
      if (
        outcomeData.result === "success" ||
        outcomeData.result === "cancelled"
      ) {
        await PerformanceSummary.findOneAndUpdate(
          { employeeId: pip.employeeId },
          {
            isPIP: false,
            $unset: { pipDetails: "" },
          },
        );
      }

      console.log(`✅ PIP ${pipId} closed with result: ${outcomeData.result}`);

      return pip;
    } catch (error) {
      console.error("❌ Error closing PIP:", error);
      throw error;
    }
  }
}

module.exports = PIPService;
