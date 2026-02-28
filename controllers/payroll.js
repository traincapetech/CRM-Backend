const Payroll = require("../models/Payroll");
const Employee = require("../models/Employee");
const Attendance = require("../models/Attendance");
const Expense = require("../models/Expense"); // Added Expense model
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// Helper function to calculate attendance stats from stored records for a month
const calculateAttendanceForMonth = async (employeeId, month, year) => {
  try {
    // Calculate date range for the month
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // Last day of month

    // Fetch all attendance records for this employee in this month
    const attendanceRecords = await Attendance.find({
      employeeId,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    }).sort({ date: 1 });

    // Calculate stats
    let presentDays = 0;
    let absentDays = 0;
    let halfDays = 0;
    let overtimeHours = 0;
    const workingDays = endDate.getDate(); // Total days in month

    attendanceRecords.forEach((record) => {
      if (record.status === "PRESENT") {
        presentDays++;
        if (record.overtimeHours) {
          overtimeHours += record.overtimeHours;
        }
      } else if (record.status === "HALF_DAY") {
        halfDays++;
      } else if (record.status === "ABSENT") {
        absentDays++;
      }
    });

    // Calculate absent days (working days - present - half days)
    const totalAttended = presentDays + halfDays;
    absentDays = Math.max(0, workingDays - totalAttended);

    return {
      presentDays,
      absentDays,
      halfDays,
      overtimeHours: Math.round(overtimeHours * 100) / 100, // Round to 2 decimals
      workingDays,
      totalRecords: attendanceRecords.length,
    };
  } catch (error) {
    console.error("Error calculating attendance for month:", error);
    return {
      presentDays: 0,
      absentDays: 0,
      halfDays: 0,
      overtimeHours: 0,
      workingDays: 30, // Default
      totalRecords: 0,
    };
  }
};

// @desc    Generate payroll for a specific month
// @route   POST /api/payroll/generate
// @access  Private (Admin/HR/Manager)
exports.generatePayroll = async (req, res) => {
  try {
    // Check authorization
    if (!["Admin", "HR", "Manager"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to generate payroll",
      });
    }

    const { employeeId, month, year } = req.body;

    // Validate input
    if (!employeeId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: "Employee ID, month, and year are required",
      });
    }

    // Check if payroll already exists
    const existingPayroll = await Payroll.findOne({
      employeeId,
      month,
      year,
    });

    if (existingPayroll) {
      return res.status(400).json({
        success: false,
        message: "Payroll already exists for this month",
      });
    }

    // Get employee details and ensure we have their userId
    const employee = await Employee.findById(employeeId).populate("userId");
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    if (!employee.userId) {
      return res.status(400).json({
        success: false,
        message: "Employee record does not have an associated user account",
      });
    }

    // Calculate attendance stats from stored attendance records if requested
    let attendanceStats = null;
    if (req.body.calculateFromAttendance !== false) {
      attendanceStats = await calculateAttendanceForMonth(
        employeeId,
        month,
        year,
      );
      console.log("📊 Attendance stats calculated:", attendanceStats);
    }

    // Create payroll record with both employeeId and userId
    const payrollData = {
      ...req.body,
      employeeId: employee._id,
      userId: employee.userId._id, // Make sure to set the userId from the employee record
      // Auto-fill from attendance if available
      ...(attendanceStats && {
        presentDays: attendanceStats.presentDays,
        absentDays: attendanceStats.absentDays,
        halfDays: attendanceStats.halfDays,
        overtimeHours: attendanceStats.overtimeHours,
        daysPresent:
          attendanceStats.presentDays + attendanceStats.halfDays * 0.5,
        workingDays: attendanceStats.workingDays,
      }),
    };

    // Calculate Expenses
    // Fetch all APPROVED and UNPAID expenses for this employee up to the end of the payroll month
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const approvedExpenses = await Expense.find({
      employeeId: employee._id,
      status: "APPROVED",
      payrollId: null,
      date: { $lte: endDate },
    });

    const totalReimbursements = approvedExpenses.reduce(
      (sum, exp) => sum + exp.amount,
      0,
    );

    if (totalReimbursements > 0) {
      payrollData.reimbursements = totalReimbursements;
      console.log(
        `💰 Found ${approvedExpenses.length} approved expenses totaling Rs. ${totalReimbursements}`,
      );
    }

    // ===== SALARY ADVANCE DEDUCTION INTEGRATION =====
    const EmployeeAdvance = require("../models/EmployeeAdvance");
    const activeAdvances = await EmployeeAdvance.find({
      employeeId: employee._id,
      status: "active",
      remainingAmount: { $gt: 0 },
    });

    let totalAdvanceDeduction = 0;
    const advanceUpdates = []; // Store updates to apply after payroll creation

    if (activeAdvances.length > 0) {
      for (const advance of activeAdvances) {
        let deductionForThisAdvance = 0;

        if (advance.deductionType === "full") {
          deductionForThisAdvance = advance.remainingAmount;
        } else {
          // partial - deduct the monthly amount, capped at remaining
          deductionForThisAdvance = Math.min(
            advance.deductionAmountPerMonth || 0,
            advance.remainingAmount,
          );
        }

        if (deductionForThisAdvance > 0) {
          totalAdvanceDeduction += deductionForThisAdvance;
          advanceUpdates.push({
            advance,
            deductionAmount: deductionForThisAdvance,
          });
        }
      }

      if (totalAdvanceDeduction > 0) {
        payrollData.advanceDeduction = totalAdvanceDeduction;
        console.log(
          `🏦 Advance deductions: Rs. ${totalAdvanceDeduction} from ${advanceUpdates.length} active advance(s)`,
        );

        // Warn if deduction exceeds 50% of gross salary
        const estimatedGross =
          payrollData.calculatedSalary || payrollData.baseSalary || 0;
        if (
          estimatedGross > 0 &&
          totalAdvanceDeduction > estimatedGross * 0.5
        ) {
          console.warn(
            `⚠️ WARNING: Advance deduction (Rs. ${totalAdvanceDeduction}) exceeds 50% of estimated salary (Rs. ${estimatedGross})`,
          );
        }
      }
    }
    // ===== END SALARY ADVANCE DEDUCTION INTEGRATION =====

    // Auto-calculate salary if baseSalary and daysPresent are available
    if (payrollData.baseSalary && payrollData.daysPresent) {
      payrollData.calculatedSalary =
        (payrollData.baseSalary / payrollData.workingDays) *
        payrollData.daysPresent;
    }

    const payroll = await Payroll.create(payrollData);

    // Link expenses to this payroll
    if (approvedExpenses.length > 0) {
      await Expense.updateMany(
        { _id: { $in: approvedExpenses.map((e) => e._id) } },
        {
          $set: {
            payrollId: payroll._id,
            status: "PAID", // Or keep as APPROVED and change to PAID when payroll is paid?
            // Plan says: Link these expenses to the new Payroll ID.
            // When payroll is DELETED, we unlink.
            // Let's mark as PAID for now to prevent double inclusion, or rely on payrollId !== null.
            // The plan says "Fetch all `APPROVED` & `UNPAID` expenses".
            // Let's set status to PAID.
          },
        },
      );
      console.log("🔗 Linked expenses to payroll");
    }

    // Update advance records after payroll creation
    if (advanceUpdates.length > 0) {
      for (const { advance, deductionAmount } of advanceUpdates) {
        advance.remainingAmount -= deductionAmount;
        if (advance.remainingAmount <= 0) {
          advance.remainingAmount = 0;
          advance.status = "completed";
        }
        advance.deductionHistory.push({
          month: parseInt(month),
          year: parseInt(year),
          deductedAmount: deductionAmount,
          deductedBy: req.user.id,
          payrollId: payroll._id,
          deductedAt: new Date(),
        });
        await advance.save();
      }
      console.log(`🏦 Updated ${advanceUpdates.length} advance record(s)`);
    }

    await payroll.save();

    res.status(201).json({
      success: true,
      data: payroll,
      message: "Payroll generated successfully",
    });
  } catch (error) {
    console.error("Generate payroll error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during payroll generation",
      error: error.message,
    });
  }
};

// @desc    Get payroll records
// @route   GET /api/payroll
// @access  Private
exports.getPayroll = async (req, res) => {
  try {
    const { month, year, employeeId } = req.query;
    let query = {};

    // Build query based on filters
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);

    // Find the employee record for the current user
    const employee = await Employee.findOne({ userId: req.user.id })
      .populate("department")
      .populate("role");

    console.log("User details:", {
      userId: req.user.id,
      userRole: req.user.role,
      employeeId: employee?._id,
      email: req.user.email,
      name: req.user.fullName,
    });

    // If employee ID is provided in query, use that
    if (employeeId) {
      query.employeeId = employeeId;
    }
    // Otherwise, if user is not admin/HR/manager, only show their own payroll
    else if (!["Admin", "HR", "Manager"].includes(req.user.role)) {
      if (employee) {
        // Use both employeeId and userId to ensure we catch all records
        query.$or = [{ employeeId: employee._id }, { userId: req.user.id }];
      } else {
        // Try to find or create employee record
        try {
          const Department = require("../models/Department");
          const EmployeeRole = require("../models/EmployeeRole");

          // Get or create default department
          let department = await Department.findOne({ name: "General" });
          if (!department) {
            department = await Department.create({
              name: "General",
              description: "Default department",
            });
          }

          // Get or create default role
          let role = await EmployeeRole.findOne({ name: req.user.role });
          if (!role) {
            role = await EmployeeRole.create({
              name: req.user.role,
              description: `Default role for ${req.user.role}`,
            });
          }

          // Create employee record
          const newEmployee = await Employee.create({
            userId: req.user.id,
            fullName: req.user.fullName,
            email: req.user.email,
            department: department._id,
            role: role._id,
            status: "ACTIVE",
          });

          console.log("Created new employee record:", newEmployee._id);
          query.$or = [
            { employeeId: newEmployee._id },
            { userId: req.user.id },
          ];
        } catch (error) {
          console.error("Error creating employee record:", error);
          query.userId = req.user.id;
        }
      }
    }

    console.log("Final query:", JSON.stringify(query, null, 2));

    // Fetch payroll records with populated employee and user details
    const payrolls = await Payroll.find(query)
      .populate({
        path: "employeeId",
        select: "fullName email department role phoneNumber userId",
        populate: [
          { path: "department", select: "name" },
          { path: "role", select: "name" },
        ],
      })
      .populate("userId", "fullName email")
      .sort({ year: -1, month: -1 });

    console.log(
      "Found payrolls:",
      payrolls.map((p) => ({
        id: p._id,
        month: p.month,
        year: p.year,
        status: p.status,
        employeeId: p.employeeId?._id,
        userId: p.userId?._id,
        netSalary: p.netSalary,
      })),
    );

    // Transform payroll data
    const transformedPayrolls = payrolls.map((p) => {
      const payrollObj = p.toObject();
      return {
        ...payrollObj,
        monthName: [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ][p.month - 1],
        // Include these fields to help with debugging
        _employeeMatch: employee
          ? employee._id.equals(p.employeeId?._id)
          : false,
        _userMatch:
          req.user.id === (p.userId?._id?.toString() || p.userId?.toString()),
      };
    });

    return res.json({
      success: true,
      count: transformedPayrolls.length,
      data: transformedPayrolls,
      debug: {
        userRole: req.user.role,
        employeeId: employee?._id,
        userId: req.user.id,
        query: query,
      },
    });
  } catch (error) {
    console.error("Error in getPayroll:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching payroll records",
      error: error.message,
    });
  }
};

// @desc    Update payroll
// @route   PUT /api/payroll/:id
// @access  Private (Admin/HR/Manager)
exports.updatePayroll = async (req, res) => {
  try {
    // Check authorization
    if (!["Admin", "HR", "Manager"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update payroll",
      });
    }

    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    // Update allowed fields
    const allowedFields = [
      "baseSalary",
      "daysPresent",
      "calculatedSalary",
      "workingDays",
      // Manual Allowances
      "hra",
      "da",
      "conveyanceAllowance",
      "medicalAllowance",
      "specialAllowance",
      "overtimeAmount",
      // Bonuses
      "performanceBonus",
      "projectBonus",
      "attendanceBonus",
      "festivalBonus",
      // Manual Deductions
      "pf",
      "esi",
      "tax",
      "loan",
      "advanceDeduction",
      "other",
      // Status and notes
      "notes",
      "status",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        payroll[field] = req.body[field];
      }
    });

    // Auto-calculate salary if base salary or days present are updated
    if (
      req.body.baseSalary !== undefined ||
      req.body.daysPresent !== undefined
    ) {
      const baseSalary = req.body.baseSalary || payroll.baseSalary;
      const daysPresent = req.body.daysPresent || payroll.daysPresent;
      payroll.calculatedSalary = (baseSalary / 30) * daysPresent;
    }

    // Auto-calculate absent days if working days or present days are updated
    if (
      req.body.workingDays !== undefined ||
      req.body.daysPresent !== undefined
    ) {
      const presentDays = req.body.daysPresent || payroll.presentDays;
      payroll.absentDays = 30 - presentDays;

      console.log("📅 Updated attendance calculation:", {
        standardWorkingDays: 30,
        presentDays: payroll.presentDays,
        absentDays: payroll.absentDays,
      });
    }

    // If status is being approved, set approval details
    if (req.body.status === "APPROVED") {
      payroll.approvedBy = req.user.id;
      payroll.approvedDate = new Date();
    }

    await payroll.save();

    // Populate employee details for response
    await payroll.populate("employeeId", "fullName email department");
    await payroll.populate("userId", "fullName email");

    res.status(200).json({
      success: true,
      data: payroll,
      message: "Payroll updated successfully",
    });
  } catch (error) {
    console.error("Update payroll error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Generate salary slip PDF
// @route   GET /api/payroll/:id/salary-slip
// @access  Private
exports.generateSalarySlip = async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id)
      .populate("employeeId", "fullName email phoneNumber department userId")
      .populate("userId", "fullName email");

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    // Check authorization - allow admin/HR/manager to view any, others only their own
    const isAdmin = ["Admin", "HR", "Manager"].includes(req.user.role);

    // Check if user is the employee (either through userId or employeeId)
    const isEmployee =
      req.user.id === payroll.userId.toString() ||
      req.user.id === payroll.employeeId?.userId?.toString();

    console.log("Generate salary slip authorization check:", {
      userId: req.user.id,
      userRole: req.user.role,
      payrollUserId: payroll.userId?.toString(),
      payrollEmployeeUserId: payroll.employeeId?.userId?.toString(),
      isAdmin,
      isEmployee,
    });

    if (!isAdmin && !isEmployee) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this salary slip",
      });
    }

    // Create PDF and pipe directly to response
    const doc = new PDFDocument({ margin: 30 });

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="salary-slip-${payroll.employeeId.fullName}-${payroll.month}-${payroll.year}.pdf"`,
    );

    // Pipe the PDF directly to the response
    doc.pipe(res);

    // Call the unified PDF generation function
    generatePDFContent(doc, payroll);

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error("Generate salary slip error:", error);
    // Only send error response if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Server error while generating salary slip",
        error: error.message,
      });
    }
  }
};

// @desc    Get salary slip download link
// @route   GET /api/payroll/:id/download
// @access  Private
exports.downloadSalarySlip = async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id)
      .populate("employeeId", "fullName email phoneNumber department userId")
      .populate("userId", "fullName email");

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    // Check authorization - allow admin/HR/manager to view any, others only their own
    const isAdmin = ["Admin", "HR", "Manager"].includes(req.user.role);

    // Check if user is the employee (either through userId or employeeId)
    const isEmployee =
      req.user.id === payroll.userId.toString() ||
      req.user.id === payroll.employeeId?.userId?.toString();

    console.log("Download authorization check:", {
      userId: req.user.id,
      userRole: req.user.role,
      payrollUserId: payroll.userId?.toString(),
      payrollEmployeeUserId: payroll.employeeId?.userId?.toString(),
      isAdmin,
      isEmployee,
    });

    if (!isAdmin && !isEmployee) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to download this salary slip",
      });
    }

    // Generate and stream the PDF
    const doc = new PDFDocument({ margin: 30 });

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="salary-slip-${payroll.employeeId.fullName}-${payroll.month}-${payroll.year}.pdf"`,
    );

    // Pipe the PDF directly to the response
    doc.pipe(res);

    // Call the unified PDF generation function
    generatePDFContent(doc, payroll);

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error("Download salary slip error:", error);
    // Only send error response if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Server error while downloading salary slip",
        error: error.message,
      });
    }
  }
};

// @desc    Approve payroll
// @route   PUT /api/payroll/:id/approve
// @access  Private (Admin/HR/Manager)
exports.approvePayroll = async (req, res) => {
  try {
    // Check authorization
    if (!["Admin", "HR", "Manager"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to approve payroll",
      });
    }

    const payroll = await Payroll.findById(req.params.id).populate(
      "employeeId",
    );
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    payroll.status = "APPROVED";
    payroll.approvedBy = req.user.id;
    payroll.approvedDate = new Date();

    // Trigger Paytm payout if employee has verified payment details
    // Migration Note: Replaced Razorpay payout logic with Paytm payout
    if (
      payroll.employeeId &&
      payroll.employeeId.paytmVerified &&
      payroll.employeeId.paytmBeneficiaryId
    ) {
      try {
        const paytmService = require("../services/paytmService");

        // Determine transfer mode based on employee's payment mode
        let transferMode = "IMPS"; // Default for bank
        if (payroll.employeeId.paymentMode === "upi") {
          transferMode = "UPI";
        }

        // Create Paytm payout (replaces Razorpay createPayout)
        const payoutData = {
          beneficiaryId: payroll.employeeId.paytmBeneficiaryId,
          amount: payroll.netSalary, // Amount in rupees
          currency: "INR",
          transferMode: transferMode,
          purpose: "salary",
          referenceId: `payroll_${payroll._id}_${payroll.month}_${payroll.year}`,
          remarks: `Salary for ${payroll.employeeId.fullName} - ${payroll.monthName} ${payroll.year}`,
        };

        const payout = await paytmService.createPayout(payoutData);

        // Update payroll with Paytm payout details (replaces Razorpay fields)
        payroll.paytmTransactionId = payout.transactionId;
        payroll.paytmPayoutStatus =
          payout.status === "SUCCESS" ? "SUCCESS" : "PENDING";
        payroll.paymentMethod =
          payroll.employeeId.paymentMode === "upi" ? "PAYTM_UPI" : "PAYTM_BANK";
        payroll.paymentDate = new Date();

        console.log(
          `✅ Paytm payout created for payroll ${payroll._id}: ${payout.transactionId}`,
        );
      } catch (payoutError) {
        console.error("Error creating Paytm payout:", payoutError);
        // Don't fail the approval if payout fails - just log the error
        // Payroll will still be approved, but payout will need to be processed manually
        payroll.paytmPayoutStatus = "FAILED";
      }
    }

    await payroll.save();

    res.status(200).json({
      success: true,
      data: payroll,
      message: payroll.paytmTransactionId
        ? "Payroll approved and Paytm payout initiated successfully"
        : "Payroll approved successfully",
    });
  } catch (error) {
    console.error("Approve payroll error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Delete payroll
// @route   DELETE /api/payroll/:id
// @access  Private (Admin/HR/Manager)
exports.deletePayroll = async (req, res) => {
  try {
    console.log("Delete payroll request received for ID:", req.params.id);
    console.log("User role:", req.user.role);

    // Check authorization
    if (!["Admin", "HR", "Manager"].includes(req.user.role)) {
      console.log("Authorization failed - user role not allowed");
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete payroll",
      });
    }

    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      console.log("Payroll not found with ID:", req.params.id);
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    console.log("Payroll found with status:", payroll.status);

    console.log("Attempting to delete payroll...");

    // Delete associated salary slip file if exists
    if (payroll.salarySlipPath && fs.existsSync(payroll.salarySlipPath)) {
      fs.unlinkSync(payroll.salarySlipPath);
      console.log("Deleted salary slip file");
    }

    // Reset associated incentives if any
    const Incentive = require("../models/Incentive");
    await Incentive.updateMany(
      { payrollId: payroll._id },
      { $unset: { payrollId: 1 } },
    );
    console.log("Reset associated incentives");

    // Unlink expenses
    const Expense = require("../models/Expense");
    await Expense.updateMany(
      { payrollId: payroll._id },
      {
        $unset: { payrollId: 1 },
        $set: { status: "APPROVED" }, // Reset status to APPROVED so they can be picked up again
      },
    );
    console.log("Unlinked associated expenses");

    await Payroll.findByIdAndDelete(req.params.id);
    console.log("Payroll deleted successfully");

    res.status(200).json({
      success: true,
      data: {},
      message: "Payroll deleted successfully",
    });
  } catch (error) {
    console.error("Delete payroll error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * Generates the content for the PDF salary slip with Enterprise Aesthetics.
 * @param {object} doc - The PDFDocument instance.
 * @param {object} payroll - The payroll data object.
 */
const generatePDFContent = (doc, payroll) => {
  // --- Styling Constants ---
  const PRIMARY_COLOR = "#1e3a8a"; // Deep Blue
  const SECONDARY_COLOR = "#475569"; // Slate 600
  const BORDER_COLOR = "#e2e8f0"; // Slate 200
  const ACCENT_BG = "#f8fafc"; // Slate 50

  const MARGIN_LEFT = 40;
  const MARGIN_RIGHT = doc.page.width - 40;
  const CONTENT_WIDTH = MARGIN_RIGHT - MARGIN_LEFT;

  const PAGE_BORDER_PADDING = 15;

  // --- Outer Border ---
  doc
    .rect(
      PAGE_BORDER_PADDING,
      PAGE_BORDER_PADDING,
      doc.page.width - PAGE_BORDER_PADDING * 2,
      doc.page.height - PAGE_BORDER_PADDING * 2,
    )
    .lineWidth(2)
    .strokeColor(PRIMARY_COLOR)
    .stroke();

  // --- Header Section ---
  const logoPath = path.join(__dirname, "../assets/images/traincape-logo.jpg");
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, MARGIN_LEFT, 45, { height: 40 });
  } else {
    // Fallback if logo not found
    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY_COLOR)
      .text("Traincape", MARGIN_LEFT, 50);
  }

  // Company Details (Right Aligned)
  doc.fontSize(10).font("Helvetica-Bold").fillColor(SECONDARY_COLOR);
  doc.text("Traincape Technology", MARGIN_RIGHT - 200, 45, {
    align: "right",
    width: 200,
  });
  doc.font("Helvetica").fontSize(9);
  doc.text("Khandolia Plaza, 118C", MARGIN_RIGHT - 200, 58, {
    align: "right",
    width: 200,
  });
  doc.text("Dabri - Palam Rd", MARGIN_RIGHT - 200, 70, {
    align: "right",
    width: 200,
  });
  doc.text("Delhi 110045, India", MARGIN_RIGHT - 200, 82, {
    align: "right",
    width: 200,
  });

  doc.moveDown(2);

  // Solid Separator
  doc
    .moveTo(MARGIN_LEFT, 110)
    .lineTo(MARGIN_RIGHT, 110)
    .lineWidth(1)
    .strokeColor(BORDER_COLOR)
    .stroke();

  // --- Title & Month ---
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  doc
    .fillColor(PRIMARY_COLOR)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("PAYSLIP", MARGIN_LEFT, 130, {
      align: "center",
      width: CONTENT_WIDTH,
      characterSpacing: 2,
    });

  doc
    .fillColor(SECONDARY_COLOR)
    .font("Helvetica")
    .fontSize(11)
    .text(`${months[payroll.month - 1]} ${payroll.year}`, MARGIN_LEFT, 155, {
      align: "center",
      width: CONTENT_WIDTH,
    });

  doc.moveDown(2);

  // --- Employee Info Box ---
  const infoBoxY = 190;
  const infoBoxHeight = 85;

  doc
    .rect(MARGIN_LEFT, infoBoxY, CONTENT_WIDTH, infoBoxHeight)
    .fillAndStroke(ACCENT_BG, BORDER_COLOR);

  doc.fillColor(SECONDARY_COLOR).fontSize(9);

  // Left Column
  const col1X = MARGIN_LEFT + 15;
  const col1ValueX = col1X + 80;
  let currentY = infoBoxY + 15;

  doc.font("Helvetica").text("Employee Name:", col1X, currentY);
  doc
    .font("Helvetica-Bold")
    .fillColor("#0f172a")
    .text(payroll.employeeId.fullName, col1ValueX, currentY);
  currentY += 18;

  doc
    .font("Helvetica")
    .fillColor(SECONDARY_COLOR)
    .text("Employee ID:", col1X, currentY);
  doc
    .font("Helvetica-Bold")
    .fillColor("#0f172a")
    .text(
      payroll.employeeId._id.toString().substring(0, 10).toUpperCase(),
      col1ValueX,
      currentY,
    );
  currentY += 18;

  doc
    .font("Helvetica")
    .fillColor(SECONDARY_COLOR)
    .text("Department:", col1X, currentY);
  doc
    .font("Helvetica-Bold")
    .fillColor("#0f172a")
    .text(payroll.employeeId.department?.name || "N/A", col1ValueX, currentY);

  // Right Column
  const col2X = MARGIN_LEFT + CONTENT_WIDTH / 2 + 15;
  const col2ValueX = col2X + 80;
  currentY = infoBoxY + 15;

  doc
    .font("Helvetica")
    .fillColor(SECONDARY_COLOR)
    .text("Working Days:", col2X, currentY);
  doc
    .font("Helvetica-Bold")
    .fillColor("#0f172a")
    .text(payroll.workingDays.toString(), col2ValueX, currentY);
  currentY += 18;

  doc
    .font("Helvetica")
    .fillColor(SECONDARY_COLOR)
    .text("Days Present:", col2X, currentY);
  doc
    .font("Helvetica-Bold")
    .fillColor("#0f172a")
    .text(payroll.daysPresent.toString(), col2ValueX, currentY);
  currentY += 18;

  doc
    .font("Helvetica")
    .fillColor(SECONDARY_COLOR)
    .text("LWP:", col2X, currentY);
  doc
    .font("Helvetica-Bold")
    .fillColor("#0f172a")
    .text(
      (payroll.workingDays - payroll.daysPresent).toString(),
      col2ValueX,
      currentY,
    );

  // --- Salary Details Table ---
  const tableY = infoBoxY + infoBoxHeight + 30;
  const colWidth = CONTENT_WIDTH / 2;

  // Table Headers (Earnings & Deductions)
  doc
    .rect(MARGIN_LEFT, tableY, colWidth, 25)
    .fillAndStroke(PRIMARY_COLOR, PRIMARY_COLOR);
  doc
    .rect(MARGIN_LEFT + colWidth, tableY, colWidth, 25)
    .fillAndStroke(PRIMARY_COLOR, PRIMARY_COLOR);

  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10);
  doc.text("EARNINGS", MARGIN_LEFT + 15, tableY + 8);
  doc.text("AMOUNT (INR)", MARGIN_LEFT + colWidth - 90, tableY + 8);

  doc.text("DEDUCTIONS", MARGIN_LEFT + colWidth + 15, tableY + 8);
  doc.text("AMOUNT (INR)", MARGIN_LEFT + CONTENT_WIDTH - 90, tableY + 8);

  // Table rows
  doc.fillColor("#0f172a").font("Helvetica").fontSize(9);
  let rowY = tableY + 30;

  const drawRow = (labelE, valE, labelD, valD, isLast = false) => {
    // Labels
    doc.font("Helvetica").fillColor(SECONDARY_COLOR);
    if (labelE) doc.text(labelE, MARGIN_LEFT + 15, rowY);
    if (labelD) doc.text(labelD, MARGIN_LEFT + colWidth + 15, rowY);

    // Values
    doc.font("Helvetica").fillColor("#0f172a");
    if (valE !== null)
      doc.text(valE.toFixed(2), MARGIN_LEFT + colWidth - 85, rowY, {
        width: 70,
        align: "right",
      });
    if (valD !== null)
      doc.text(valD.toFixed(2), MARGIN_LEFT + CONTENT_WIDTH - 85, rowY, {
        width: 70,
        align: "right",
      });

    rowY += 18;

    if (!isLast) {
      doc
        .moveTo(MARGIN_LEFT + 10, rowY - 5)
        .lineTo(MARGIN_RIGHT - 10, rowY - 5)
        .lineWidth(0.5)
        .strokeColor("#f1f5f9")
        .stroke();
      rowY += 5;
    }
  };

  // Compile items
  const earnings = [
    { label: "Base Salary", val: payroll.baseSalary },
    { label: "House Rent Allowance", val: payroll.hra },
    { label: "Dearness Allowance", val: payroll.da },
    { label: "Conveyance", val: payroll.conveyanceAllowance },
    { label: "Medical Allowance", val: payroll.medicalAllowance },
    { label: "Special Allowance", val: payroll.specialAllowance },
    { label: "Overtime Amount", val: payroll.overtimeAmount },
    { label: "Reimbursements", val: payroll.reimbursements || 0 },
    { label: "Performance Bonus", val: payroll.performanceBonus },
    { label: "Project/Incentive Bonus", val: payroll.projectBonus },
    { label: "Attendance Bonus", val: payroll.attendanceBonus },
    { label: "Festival Bonus", val: payroll.festivalBonus },
  ].filter((i) => i.val > 0);

  const deductions = [
    { label: "Provident Fund (PF)", val: payroll.pf },
    { label: "ESI", val: payroll.esi },
    { label: "Professional Tax", val: payroll.tax },
    { label: "Loan Recovery", val: payroll.loan },
    { label: "Advance Deduction", val: payroll.advanceDeduction || 0 },
    { label: "Other Deductions", val: payroll.other },
  ].filter((i) => i.val > 0);

  const rowCount = Math.max(earnings.length, deductions.length);

  for (let i = 0; i < rowCount; i++) {
    const e = earnings[i] || { label: "", val: null };
    const d = deductions[i] || { label: "", val: null };
    drawRow(e.label, e.val, d.label, d.val, i === rowCount - 1);
  }

  // Table Vertical Divider
  doc
    .moveTo(MARGIN_LEFT + colWidth, tableY + 25)
    .lineTo(MARGIN_LEFT + colWidth, rowY)
    .lineWidth(1)
    .strokeColor(BORDER_COLOR)
    .stroke();

  // Table Outer Frame (Sides & Bottom)
  doc.moveTo(MARGIN_LEFT, tableY).lineTo(MARGIN_LEFT, rowY).stroke();
  doc.moveTo(MARGIN_RIGHT, tableY).lineTo(MARGIN_RIGHT, rowY).stroke();
  doc.moveTo(MARGIN_LEFT, rowY).lineTo(MARGIN_RIGHT, rowY).stroke();

  // --- Summary Totals Row ---
  const totalEarnings = earnings.reduce((sum, item) => sum + item.val, 0);
  const totalDeductions = deductions.reduce((sum, item) => sum + item.val, 0);

  doc
    .rect(MARGIN_LEFT, rowY, colWidth, 25)
    .fillAndStroke(ACCENT_BG, BORDER_COLOR);
  doc
    .rect(MARGIN_LEFT + colWidth, rowY, colWidth, 25)
    .fillAndStroke(ACCENT_BG, BORDER_COLOR);

  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10);
  doc.text("Total Earnings", MARGIN_LEFT + 15, rowY + 8);
  doc.text(totalEarnings.toFixed(2), MARGIN_LEFT + colWidth - 85, rowY + 8, {
    width: 70,
    align: "right",
  });

  doc.text("Total Deductions", MARGIN_LEFT + colWidth + 15, rowY + 8);
  doc.text(
    totalDeductions.toFixed(2),
    MARGIN_LEFT + CONTENT_WIDTH - 85,
    rowY + 8,
    { width: 70, align: "right" },
  );

  // --- Net Salary Highlight ---
  doc.moveDown(4);
  const netY = doc.y;

  doc
    .rect(MARGIN_RIGHT - 250, netY, 250, 45)
    .fillAndStroke(PRIMARY_COLOR, PRIMARY_COLOR);
  doc.fillColor("#ffffff").font("Helvetica").fontSize(11);
  doc.text("NET SALARY", MARGIN_RIGHT - 235, netY + 16);

  doc.font("Helvetica-Bold").fontSize(16);
  doc.text(
    `INR ${payroll.netSalary.toFixed(2)}`,
    MARGIN_RIGHT - 165,
    netY + 14,
    { width: 140, align: "right" },
  );

  doc.moveDown(3);

  // --- Signature Line / Footer ---
  const footerY = doc.page.height - 100;

  const signPath =
    "/Users/a/Desktop/Traincape_CRM-main/client/dist/assets/Parichay_Sign-Z_7nzyfB.png";
  if (fs.existsSync(signPath)) {
    doc.image(signPath, MARGIN_RIGHT - 130, footerY - 45, { width: 110 });
  }

  doc
    .moveTo(MARGIN_RIGHT - 150, footerY)
    .lineTo(MARGIN_RIGHT, footerY)
    .lineWidth(0.5)
    .strokeColor(SECONDARY_COLOR)
    .stroke();

  doc.fillColor(SECONDARY_COLOR).font("Helvetica").fontSize(9);
  doc.text("Authorized Signatory", MARGIN_RIGHT - 150, footerY + 10, {
    width: 150,
    align: "center",
  });

  doc.fillColor("#94a3b8").fontSize(8);
  doc.text(
    "This is a computer-generated document and does not require a physical signature.",
    MARGIN_LEFT,
    doc.page.height - 50,
    { align: "center", width: CONTENT_WIDTH },
  );
};

// @desc    Delete payroll
// @route   DELETE /api/payroll/:id
// @access  Private (Admin/HR/Manager)
exports.deletePayroll = async (req, res) => {
  try {
    console.log("Delete payroll request received for ID:", req.params.id);
    console.log("User role:", req.user.role);

    // Check authorization
    if (!["Admin", "HR", "Manager"].includes(req.user.role)) {
      console.log("Authorization failed - user role not allowed");
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete payroll",
      });
    }

    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      console.log("Payroll not found with ID:", req.params.id);
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    console.log("Payroll found with status:", payroll.status);

    console.log("Attempting to delete payroll...");

    // Delete associated salary slip file if exists
    if (payroll.salarySlipPath && fs.existsSync(payroll.salarySlipPath)) {
      fs.unlinkSync(payroll.salarySlipPath);
      console.log("Deleted salary slip file");
    }

    // Reset associated incentives if any
    const Incentive = require("../models/Incentive");
    await Incentive.updateMany(
      { payrollId: payroll._id },
      { $unset: { payrollId: 1 } },
    );
    console.log("Reset associated incentives");

    await Payroll.findByIdAndDelete(req.params.id);
    console.log("Payroll deleted successfully");

    res.status(200).json({
      success: true,
      data: {},
      message: "Payroll deleted successfully",
    });
  } catch (error) {
    console.error("Delete payroll error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Export payroll report for a month as PDF
// @route   GET /api/payroll/export-report
// @access  Private (Admin/HR/Manager)
exports.exportPayrollReport = async (req, res) => {
  try {
    // Check authorization
    if (!["Admin", "HR", "Manager"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to export payroll report",
      });
    }

    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "Month and year are required",
      });
    }

    // Fetch all payroll records for the specified month/year
    const payrolls = await Payroll.find({
      month: parseInt(month),
      year: parseInt(year),
    })
      .populate({
        path: "employeeId",
        select: "fullName email department role",
        populate: [
          { path: "department", select: "name" },
          { path: "role", select: "name" },
        ],
      })
      .sort({ "employeeId.fullName": 1 });

    if (payrolls.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No payroll records found for the specified month",
      });
    }

    // Create PDF
    const doc = new PDFDocument({
      margin: 30,
      size: "A4",
      layout: "landscape",
    });

    // Set response headers
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const monthName = monthNames[parseInt(month) - 1];

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payroll-report-${monthName}-${year}.pdf"`,
    );

    // Pipe the PDF directly to the response
    doc.pipe(res);

    // Company Logo
    const logoPath = path.join(
      __dirname,
      "../assets/images/traincape-logo.jpg",
    );
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 30, 30, { width: 60 });
    }

    // Header
    doc
      .fontSize(20)
      .text("PAYROLL SUMMARY REPORT", 100, 40, { align: "center" });
    doc.fontSize(12).text("Traincape Technology", { align: "center" });
    doc
      .fontSize(10)
      .text("Khandolia Plaza, 118C, Dabri - Palam Rd, Delhi 110045", {
        align: "center",
      });
    doc.moveDown();
    doc.fontSize(14).text(`${monthName} ${year}`, { align: "center" });
    doc.moveDown();

    // Draw line
    doc
      .strokeColor("#333333")
      .lineWidth(1)
      .moveTo(30, doc.y)
      .lineTo(doc.page.width - 30, doc.y)
      .stroke();
    doc.moveDown();

    // Summary Statistics
    const totalGross = payrolls.reduce(
      (sum, p) => sum + (p.grossSalary || 0),
      0,
    );
    const totalDeductions = payrolls.reduce(
      (sum, p) => sum + (p.totalDeductions || 0),
      0,
    );
    const totalNet = payrolls.reduce((sum, p) => sum + (p.netSalary || 0), 0);
    const draftCount = payrolls.filter((p) => p.status === "DRAFT").length;
    const approvedCount = payrolls.filter(
      (p) => p.status === "APPROVED",
    ).length;
    const paidCount = payrolls.filter((p) => p.status === "PAID").length;

    doc.fontSize(11);
    doc.text(`Total Employees: ${payrolls.length}`, 30);
    doc.text(
      `Status - Draft: ${draftCount} | Approved: ${approvedCount} | Paid: ${paidCount}`,
      250,
      doc.y - 13,
    );
    doc.moveDown(0.5);
    doc.text(
      `Total Gross Salary: ₹${totalGross.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      30,
    );
    doc.text(
      `Total Deductions: ₹${totalDeductions.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      300,
      doc.y - 13,
    );
    doc.text(
      `Total Net Salary: ₹${totalNet.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      550,
      doc.y - 13,
    );
    doc.moveDown();

    // Draw line
    doc
      .strokeColor("#333333")
      .lineWidth(1)
      .moveTo(30, doc.y)
      .lineTo(doc.page.width - 30, doc.y)
      .stroke();
    doc.moveDown(0.5);

    // Table Header
    const tableTop = doc.y;
    const colWidths = [25, 140, 100, 70, 55, 75, 75, 75, 70];
    const headers = [
      "#",
      "Employee Name",
      "Department",
      "Days",
      "Status",
      "Gross (₹)",
      "Deductions (₹)",
      "Net (₹)",
      "Bonuses (₹)",
    ];

    doc.fontSize(9).font("Helvetica-Bold");
    let xPos = 30;
    headers.forEach((header, i) => {
      doc.text(header, xPos, tableTop, {
        width: colWidths[i],
        align: i === 0 ? "center" : "left",
      });
      xPos += colWidths[i];
    });

    doc.moveDown(0.3);
    doc
      .strokeColor("#aaaaaa")
      .lineWidth(0.5)
      .moveTo(30, doc.y)
      .lineTo(doc.page.width - 30, doc.y)
      .stroke();
    doc.moveDown(0.3);

    // Table Rows
    doc.font("Helvetica").fontSize(8);
    let rowY = doc.y;

    payrolls.forEach((payroll, index) => {
      // Check if we need a new page
      if (rowY > doc.page.height - 60) {
        doc.addPage({ layout: "landscape" });
        rowY = 50;
      }

      const bonuses =
        (payroll.performanceBonus || 0) +
        (payroll.projectBonus || 0) +
        (payroll.attendanceBonus || 0) +
        (payroll.festivalBonus || 0);

      const statusColors = {
        DRAFT: "#666666",
        APPROVED: "#22c55e",
        PAID: "#3b82f6",
        CANCELLED: "#ef4444",
      };

      xPos = 30;
      doc.fillColor("#333333");
      doc.text((index + 1).toString(), xPos, rowY, {
        width: colWidths[0],
        align: "center",
      });
      xPos += colWidths[0];

      doc.text(payroll.employeeId?.fullName || "N/A", xPos, rowY, {
        width: colWidths[1] - 5,
      });
      xPos += colWidths[1];

      doc.text(payroll.employeeId?.department?.name || "N/A", xPos, rowY, {
        width: colWidths[2] - 5,
      });
      xPos += colWidths[2];

      doc.text(
        `${payroll.daysPresent || 0}/${payroll.workingDays || 30}`,
        xPos,
        rowY,
        { width: colWidths[3] },
      );
      xPos += colWidths[3];

      doc.fillColor(statusColors[payroll.status] || "#666666");
      doc.text(payroll.status || "DRAFT", xPos, rowY, { width: colWidths[4] });
      xPos += colWidths[4];

      doc.fillColor("#333333");
      doc.text((payroll.grossSalary || 0).toLocaleString("en-IN"), xPos, rowY, {
        width: colWidths[5],
      });
      xPos += colWidths[5];

      doc.text(
        (payroll.totalDeductions || 0).toLocaleString("en-IN"),
        xPos,
        rowY,
        { width: colWidths[6] },
      );
      xPos += colWidths[6];

      doc.font("Helvetica-Bold");
      doc.text((payroll.netSalary || 0).toLocaleString("en-IN"), xPos, rowY, {
        width: colWidths[7],
      });
      xPos += colWidths[7];

      doc.font("Helvetica");
      doc.text(bonuses.toLocaleString("en-IN"), xPos, rowY, {
        width: colWidths[8],
      });

      rowY += 15;

      // Light separator line every row
      if (index < payrolls.length - 1) {
        doc
          .strokeColor("#eeeeee")
          .lineWidth(0.3)
          .moveTo(30, rowY - 3)
          .lineTo(doc.page.width - 30, rowY - 3)
          .stroke();
      }
    });

    // Footer
    doc.y = rowY + 10;
    doc
      .strokeColor("#333333")
      .lineWidth(1)
      .moveTo(30, doc.y)
      .lineTo(doc.page.width - 30, doc.y)
      .stroke();
    doc.moveDown();

    doc.fontSize(8).font("Helvetica");
    doc.fillColor("#666666");
    doc.text(`Report generated on: ${new Date().toLocaleString("en-IN")}`, 30);
    doc.text(`Generated by: ${req.user.fullName || req.user.email}`, 30);
    doc.moveDown();
    doc.text("This is a computer-generated report. No signature is required.", {
      align: "center",
    });

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error("Export payroll report error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Server error while generating payroll report",
        error: error.message,
      });
    }
  }
};
