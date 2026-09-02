const mongoose = require("mongoose");
const User = require("../models/User");
const Employee = require("../models/Employee");
const Attendance = require("../models/Attendance");
const Leave = require("../models/Leave");
const Lead = require("../models/Lead");
const notificationService = require("./notificationService");
const performanceCalculation = require("./performanceCalculation");

/**
 * Role hierarchy for seniority ranking (higher score = more senior)
 */
const ROLE_SENIORITY_SCORES = {
  "Sales Manager": 100,
  "Manager": 90,
  "Sales Team Leader": 80,
  "Team Leader": 80,
  "Team Lead": 80,
  "Senior Sales Executive": 60,
  "Sales Executive": 40,
  "Sales Person": 20,
};

/**
 * Fetch present sales persons eligible for lead assignment today
 * (Excludes users marked ABSENT or ON_LEAVE in Attendance or with approved Leave today)
 */
const getPresentSalesPersons = async (targetDate = new Date()) => {
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  // 1. Fetch active users in Sales roles
  const salesRoles = [
    "Sales Person",
    "Senior Sales Executive",
    "Sales Executive",
    "Sales Team Leader",
    "Sales Manager",
    "Team Leader",
  ];

  const salesUsers = await User.find({
    active: true,
    role: { $in: salesRoles },
  }).populate({
    path: "employeeId",
    populate: { path: "role", select: "name" },
  });

  if (salesUsers.length === 0) {
    return [];
  }

  const userIds = salesUsers.map((u) => u._id);
  const employeeIds = salesUsers
    .filter((u) => u.employeeId)
    .map((u) => u.employeeId._id);

  // 2. Fetch Attendance records for today
  const todayAttendanceRecords = await Attendance.find({
    date: { $gte: startOfDay, $lte: endOfDay },
    $or: [
      { userId: { $in: userIds } },
      { employeeId: { $in: employeeIds } },
    ],
  });

  const absentUserIds = new Set();
  const absentEmployeeIds = new Set();

  todayAttendanceRecords.forEach((att) => {
    const uId = att.userId ? att.userId.toString() : null;
    const eId = att.employeeId ? att.employeeId.toString() : null;

    // Full day absent or on leave
    if (att.status === "ABSENT" || att.status === "ON_LEAVE") {
      if (uId) absentUserIds.add(uId);
      if (eId) absentEmployeeIds.add(eId);
    }

    // Checked out / Left early (went home in second half)
    if (att.checkOut && new Date(att.checkOut) <= targetDate) {
      if (["EARLY_LEAVE", "HALF_DAY", "PRESENT"].includes(att.status)) {
        if (uId) absentUserIds.add(uId);
        if (eId) absentEmployeeIds.add(eId);
      }
    }
  });

  // 3. Fetch approved Leave records spanning today
  const approvedLeaves = await Leave.find({
    status: "approved",
    startDate: { $lte: endOfDay },
    endDate: { $gte: startOfDay },
    $or: [
      { userId: { $in: userIds } },
      { employeeId: { $in: employeeIds } },
    ],
  });

  const currentHour = new Date(targetDate).getHours(); // e.g. 14 for 2 PM

  approvedLeaves.forEach((leave) => {
    const uId = leave.userId ? leave.userId.toString() : null;
    const eId = leave.employeeId ? leave.employeeId.toString() : null;

    if (leave.isHalfDay) {
      // Morning Half-Day: Absent in morning (< 1 PM / 13:00), Present in afternoon (>= 1 PM)
      if (leave.halfDaySession === "morning") {
        if (currentHour < 13) {
          if (uId) absentUserIds.add(uId);
          if (eId) absentEmployeeIds.add(eId);
        }
      }
      // Afternoon Half-Day: Present in morning (< 1 PM), Absent in afternoon (>= 1 PM)
      else if (leave.halfDaySession === "afternoon") {
        if (currentHour >= 13) {
          if (uId) absentUserIds.add(uId);
          if (eId) absentEmployeeIds.add(eId);
        }
      }
    } else {
      // Full day leave
      if (uId) absentUserIds.add(uId);
      if (eId) absentEmployeeIds.add(eId);
    }
  });

  // 4. Filter present sales persons
  const presentSalesPersons = salesUsers.filter((user) => {
    const uIdStr = user._id.toString();
    const empIdStr = user.employeeId ? user.employeeId._id.toString() : null;

    if (absentUserIds.has(uIdStr)) return false;
    if (empIdStr && absentEmployeeIds.has(empIdStr)) return false;
    return true;
  });

  return presentSalesPersons;
};

/**
 * Helper to compute effective Seniority score for a salesperson
 * Checks both User.role and linked Employee.role.name
 */
const getEffectiveSeniorityScore = (user) => {
  const userScore = ROLE_SENIORITY_SCORES[user.role] || 10;
  let empScore = 10;
  if (user.employeeId && user.employeeId.role && user.employeeId.role.name) {
    empScore = ROLE_SENIORITY_SCORES[user.employeeId.role.name] || 10;
  }
  return Math.max(userScore, empScore);
};

/**
 * Rank present sales persons by Seniority:
 * 1. Role Score (Sales Manager > Senior Sales Exec > Sales Exec > Sales Person)
 * 2. Employee Joining Date (earliest first)
 * 3. User Creation Date (earliest first)
 */
const rankSalesPersonsBySeniority = (salesPersons) => {
  return [...salesPersons].sort((a, b) => {
    // 1. Compare Role Seniority Score (combining User.role and Employee.role)
    const scoreA = getEffectiveSeniorityScore(a);
    const scoreB = getEffectiveSeniorityScore(b);
    if (scoreA !== scoreB) {
      return scoreB - scoreA; // Descending score
    }

    // 2. Compare Joining Date if available
    const joiningA = a.employeeId && a.employeeId.joiningDate
      ? new Date(a.employeeId.joiningDate).getTime()
      : new Date(a.createdAt).getTime();

    const joiningB = b.employeeId && b.employeeId.joiningDate
      ? new Date(b.employeeId.joiningDate).getTime()
      : new Date(b.createdAt).getTime();

    if (joiningA !== joiningB) {
      return joiningA - joiningB; // Ascending (earliest date = more senior)
    }

    // 3. User Creation Date fallback
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
};

/**
 * In-memory / DB state for single-lead sequential round robin assignment
 */
let lastAssignedUserIndex = 0;

/**
 * Get next sales person for instant single lead assignment
 */
const getNextSingleSalesPerson = async (targetDate = new Date()) => {
  const presentPersons = await getPresentSalesPersons(targetDate);
  if (presentPersons.length === 0) return null;

  // Rank by seniority to establish deterministic ordering
  const rankedPersons = rankSalesPersonsBySeniority(presentPersons);

  // Pick next person in sequence
  lastAssignedUserIndex = lastAssignedUserIndex % rankedPersons.length;
  const selectedPerson = rankedPersons[lastAssignedUserIndex];
  lastAssignedUserIndex = (lastAssignedUserIndex + 1) % rankedPersons.length;

  return selectedPerson;
};

/**
 * Auto-assign a single lead via Round Robin
 */
const assignSingleLeadRoundRobin = async (leadDoc, assignedByUser = null) => {
  const selectedPerson = await getNextSingleSalesPerson();

  if (!selectedPerson) {
    console.warn("⚠️ No present sales persons available for auto-assignment.");
    return {
      lead: leadDoc,
      success: false,
      message: "No present sales persons available today for auto-assignment",
    };
  }

  const assigneeId = selectedPerson._id;
  const assignerId = assignedByUser ? assignedByUser._id : assigneeId;

  if (!leadDoc.originalAssignedTo) {
    leadDoc.originalAssignedTo = assigneeId;
  }

  leadDoc.assignedTo = assigneeId;
  leadDoc.assignmentMethod = "ROUND_ROBIN";

  if (!leadDoc.assignmentHistory) {
    leadDoc.assignmentHistory = [];
  }

  // Close previous unassigned history if any
  if (leadDoc.assignmentHistory.length > 0) {
    const lastHist = leadDoc.assignmentHistory[leadDoc.assignmentHistory.length - 1];
    if (!lastHist.unassignedAt) {
      lastHist.unassignedAt = new Date();
    }
  }

  leadDoc.assignmentHistory.push({
    assignedTo: assigneeId,
    assignedBy: assignerId,
    assignedAt: new Date(),
    assignmentMethod: "ROUND_ROBIN",
    note: `Auto-assigned via Round Robin to present salesperson ${selectedPerson.fullName}`,
  });

  await leadDoc.save();

  // Send real-time Socket notification
  try {
    const io = require("../sockets").getIO ? require("../sockets").getIO() : null;
    if (io) {
      io.emit("leadAssigned", {
        leadId: leadDoc._id,
        leadName: leadDoc.name,
        course: leadDoc.course,
        assignedTo: assigneeId,
        assignedToName: selectedPerson.fullName,
        assignedBy: assignedByUser ? assignedByUser.fullName : "System (Round Robin)",
      });
    }
  } catch (err) {
    console.warn("Socket notification skipped:", err.message);
  }

  // Trigger performance recalculation
  try {
    if (performanceCalculation.updateDailyRecordForUser) {
      await performanceCalculation.updateDailyRecordForUser(assigneeId);
    }
  } catch (err) {
    console.warn("Performance calc skipped:", err.message);
  }

  return {
    lead: leadDoc,
    success: true,
    assignedTo: selectedPerson,
  };
};

/**
 * Distribute a batch of leads via Round Robin with Seniority remainder distribution
 * Example: 8 leads & 6 present sales persons -> Each gets 1, top 2 senior get +1 bonus.
 */
const distributeLeadsBatchRoundRobin = async (leadDocs, assignedByUser = null, targetDate = new Date()) => {
  if (!leadDocs || leadDocs.length === 0) {
    return { success: true, count: 0, assignments: [] };
  }

  const presentPersons = await getPresentSalesPersons(targetDate);

  if (presentPersons.length === 0) {
    console.warn("⚠️ Cannot batch assign leads: No present sales persons available today.");
    return {
      success: false,
      count: 0,
      message: "No present sales persons available today for Round Robin assignment.",
    };
  }

  // Rank present sales persons by seniority (Most Senior first)
  const rankedPersons = rankSalesPersonsBySeniority(presentPersons);
  const totalLeads = leadDocs.length;
  const totalPersons = rankedPersons.length;

  const baseLeadsPerPerson = Math.floor(totalLeads / totalPersons);
  const remainderLeads = totalLeads % totalPersons;

  // Calculate quota for each salesperson
  // Senior employees (indices 0 to remainderLeads - 1) get (baseLeadsPerPerson + 1)
  const personQuotas = rankedPersons.map((person, index) => {
    const isSeniorBonus = index < remainderLeads;
    return {
      person,
      quota: baseLeadsPerPerson + (isSeniorBonus ? 1 : 0),
      isSeniorBonus,
      assignedCount: 0,
    };
  });

  const assignments = [];
  let leadIndex = 0;

  // First round: Round-Robin distribution up to quota
  while (leadIndex < totalLeads) {
    for (let p = 0; p < personQuotas.length && leadIndex < totalLeads; p++) {
      const quotaObj = personQuotas[p];
      if (quotaObj.assignedCount < quotaObj.quota) {
        const lead = leadDocs[leadIndex];
        const method = quotaObj.isSeniorBonus && quotaObj.assignedCount >= baseLeadsPerPerson
          ? "SENIOR_ALLOCATION"
          : "ROUND_ROBIN";

        const assignerId = assignedByUser ? assignedByUser._id : quotaObj.person._id;

        if (!lead.originalAssignedTo) {
          lead.originalAssignedTo = quotaObj.person._id;
        }

        lead.assignedTo = quotaObj.person._id;
        lead.assignmentMethod = method;

        if (!lead.assignmentHistory) {
          lead.assignmentHistory = [];
        }

        if (lead.assignmentHistory.length > 0) {
          const lastHist = lead.assignmentHistory[lead.assignmentHistory.length - 1];
          if (!lastHist.unassignedAt) {
            lastHist.unassignedAt = new Date();
          }
        }

        const note = method === "SENIOR_ALLOCATION"
          ? `Assigned as Seniority Bonus lead to ${quotaObj.person.fullName}`
          : `Assigned via Round Robin to ${quotaObj.person.fullName}`;

        lead.assignmentHistory.push({
          assignedTo: quotaObj.person._id,
          assignedBy: assignerId,
          assignedAt: new Date(),
          assignmentMethod: method,
          note,
        });

        await lead.save();

        assignments.push({
          leadId: lead._id,
          leadName: lead.name,
          assignedTo: quotaObj.person,
          method,
        });

        quotaObj.assignedCount++;
        leadIndex++;
      }
    }
  }

  // Trigger notifications and performance updates for all assignees
  const uniqueAssigneeIds = [...new Set(assignments.map((a) => a.assignedTo._id.toString()))];
  for (const assigneeId of uniqueAssigneeIds) {
    try {
      if (performanceCalculation.updateDailyRecordForUser) {
        await performanceCalculation.updateDailyRecordForUser(assigneeId);
      }
    } catch (e) {
      // Ignore performance calc error
    }
  }

  return {
    success: true,
    count: assignments.length,
    assignments,
    summary: personQuotas.map((pq) => ({
      name: pq.person.fullName,
      role: pq.person.role,
      assignedCount: pq.assignedCount,
      isSeniorBonus: pq.isSeniorBonus,
    })),
  };
};

module.exports = {
  getPresentSalesPersons,
  rankSalesPersonsBySeniority,
  assignSingleLeadRoundRobin,
  distributeLeadsBatchRoundRobin,
};
