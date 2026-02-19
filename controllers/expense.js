const Expense = require("../models/Expense");
const User = require("../models/User");
const Employee = require("../models/Employee");
const { uploadToR2 } = require("../services/r2Service"); // Assuming R2 service exists
const fs = require("fs");
const path = require("path");

// @desc    Get all expenses (Admin/Manager view all, Employee views own)
// @route   GET /api/expenses
// @access  Private
exports.getExpenses = async (req, res) => {
  try {
    const { status, month, year, employeeId } = req.query;
    let query = {};

    // Role-based filtering
    if (
      [
        "Employee",
        "Sales Person",
        "Lead Person",
        "IT Staff",
        "IT Intern",
      ].includes(req.user.role)
    ) {
      // Employees can only see their own expenses
      query.userId = req.user.id;
    } else if (req.user.role === "Manager" || req.user.role === "IT Manager") {
      // Managers can see all for now, or we could filter by department later
      // For now, let's allow them to see filtered by employeeId if provided, or all if not restricted
      if (employeeId) query.employeeId = employeeId;
    } else {
      // Admin/HR can see all
      if (employeeId) query.employeeId = employeeId;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by month/year
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      query.date = { $gte: startDate, $lte: endDate };
    }

    const expenses = await Expense.find(query)
      .populate("employeeId", "firstName lastName email")
      .populate("userId", "fullName email")
      .populate("approvedBy", "fullName")
      .sort({ date: -1 });

    res.status(200).json({
      success: true,
      count: expenses.length,
      data: expenses,
    });
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Submit a new expense claim
// @route   POST /api/expenses
// @access  Private
exports.createExpense = async (req, res) => {
  try {
    const { title, description, amount, date, category } = req.body;

    // Find employee record for the user
    const employee = await Employee.findOne({ userId: req.user.id });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee profile not found. Please contact HR.",
      });
    }

    const { uploadFile } = require("../services/fileStorageService");

    let attachments = [];
    if (req.files && req.files.length > 0) {
      // Handle file uploads using generic uploadFile service
      for (const file of req.files) {
        const result = await uploadFile(file, "expenses");

        attachments.push({
          url: result.url,
          type: file.mimetype.startsWith("image/") ? "image" : "pdf",
          fileName: result.originalName || file.originalname,
        });
      }
    }

    const expense = await Expense.create({
      employeeId: employee._id,
      userId: req.user.id,
      title,
      description,
      amount,
      date: date || Date.now(),
      category,
      attachments,
      status: "PENDING",
    });

    res.status(201).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    console.error("Error creating expense:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};

// @desc    Update expense status (Approve/Reject)
// @route   PATCH /api/expenses/:id/status
// @access  Private (Admin/Manager)
exports.updateExpenseStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    if (expense.status === "PAID") {
      return res.status(400).json({
        success: false,
        message: "Cannot change status of a PAID expense",
      });
    }

    expense.status = status;
    expense.approvedBy = req.user.id;
    expense.approvalDate = Date.now();
    if (status === "REJECTED") {
      expense.rejectionReason = rejectionReason;
    }

    await expense.save();

    res.status(200).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    console.error("Error updating expense status:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private (Owner/Admin)
exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    // Check ownership
    // Admin/Manager can delete? Maybe only if PENDING?
    // Owner can delete if PENDING
    if (
      expense.userId.toString() !== req.user.id &&
      !["Admin", "Manager", "HR"].includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this expense",
      });
    }

    if (expense.status === "PAID" || expense.status === "APPROVED") {
      // Ideally shouldn't delete approved expenses unless admin overrides
      if (req.user.role !== "Admin") {
        return res.status(400).json({
          success: false,
          message: "Cannot delete Approved or Paid expenses",
        });
      }
    }

    await expense.deleteOne();

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
