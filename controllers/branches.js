const Branch = require("../models/Branch");
const Employee = require("../models/Employee");
const asyncHandler = require("../middleware/async");

// @desc    Get all branches
// @route   GET /api/branches
// @access  Private
exports.getBranches = asyncHandler(async (req, res, next) => {
  const query = {};

  // If query specifies status, filter by status
  if (req.query.status !== undefined) {
    query.status = req.query.status === "true";
  } else if (req.user.role !== "Admin" && req.user.role !== "HR") {
    // Non-admin/HR users only see active branches by default
    query.status = true;
  }

  const branches = await Branch.find(query)
    .populate("createdBy", "fullName email")
    .sort({ name: 1 });

  res.status(200).json({
    success: true,
    count: branches.length,
    data: branches,
  });
});

// @desc    Get single branch
// @route   GET /api/branches/:id
// @access  Private
exports.getBranch = asyncHandler(async (req, res, next) => {
  const branch = await Branch.findById(req.params.id).populate(
    "createdBy",
    "fullName email"
  );

  if (!branch) {
    return res.status(404).json({
      success: false,
      message: "Branch not found",
    });
  }

  res.status(200).json({
    success: true,
    data: branch,
  });
});

// Helper to escape regex characters
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// @desc    Create new branch
// @route   POST /api/branches
// @access  Private/Admin
exports.createBranch = asyncHandler(async (req, res, next) => {
  if (req.user.role === "Branch Partner") {
    return res.status(403).json({
      success: false,
      message: "Branch Partner role has view-only access.",
    });
  }
  const userId = req.user._id || req.user.id;
  req.body.createdBy = userId;

  const { name, code } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: "Branch name is required",
    });
  }

  if (!code || !code.trim()) {
    return res.status(400).json({
      success: false,
      message: "Branch code is required",
    });
  }

  const cleanName = name.trim();
  const cleanCode = code.trim().toUpperCase();

  // Case-insensitive check for duplicate name
  const existingName = await Branch.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(cleanName)}$`, "i") },
  });
  if (existingName) {
    return res.status(400).json({
      success: false,
      message: `Branch with name '${cleanName}' already exists.`,
    });
  }

  // Case-insensitive check for duplicate code
  const existingCode = await Branch.findOne({
    code: { $regex: new RegExp(`^${escapeRegex(cleanCode)}$`, "i") },
  });
  if (existingCode) {
    return res.status(400).json({
      success: false,
      message: `Branch with code '${cleanCode}' already exists.`,
    });
  }

  req.body.name = cleanName;
  req.body.code = cleanCode;

  const branch = await Branch.create(req.body);

  res.status(201).json({
    success: true,
    data: branch,
  });
});

// @desc    Update branch
// @route   PUT /api/branches/:id
// @access  Private/Admin
exports.updateBranch = asyncHandler(async (req, res, next) => {
  let branch = await Branch.findById(req.params.id);

  if (!branch) {
    return res.status(404).json({
      success: false,
      message: "Branch not found",
    });
  }

  const { name, code } = req.body;

  // Check duplicate name if changing
  if (name && name.trim().toLowerCase() !== branch.name.toLowerCase()) {
    const cleanName = name.trim();
    const existingName = await Branch.findOne({
      _id: { $ne: req.params.id },
      name: { $regex: new RegExp(`^${escapeRegex(cleanName)}$`, "i") },
    });
    if (existingName) {
      return res.status(400).json({
        success: false,
        message: `Branch with name '${cleanName}' already exists.`,
      });
    }
    req.body.name = cleanName;
  }

  // Check duplicate code if changing
  if (code && code.trim().toLowerCase() !== branch.code.toLowerCase()) {
    const cleanCode = code.trim().toUpperCase();
    const existingCode = await Branch.findOne({
      _id: { $ne: req.params.id },
      code: { $regex: new RegExp(`^${escapeRegex(cleanCode)}$`, "i") },
    });
    if (existingCode) {
      return res.status(400).json({
        success: false,
        message: `Branch with code '${cleanCode}' already exists.`,
      });
    }
    req.body.code = cleanCode;
  }

  branch = await Branch.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: branch,
  });
});

// @desc    Deactivate or Delete branch
// @route   DELETE /api/branches/:id
// @access  Private/Admin
exports.deleteBranch = asyncHandler(async (req, res, next) => {
  const branch = await Branch.findById(req.params.id);

  if (!branch) {
    return res.status(404).json({
      success: false,
      message: "Branch not found",
    });
  }

  // Check if any employees are linked to this branch
  const linkedEmployees = await Employee.countDocuments({ branchId: req.params.id });

  if (linkedEmployees > 0) {
    // Safely deactivate instead of hard deletion to preserve employee linkages
    branch.status = false;
    await branch.save();

    return res.status(200).json({
      success: true,
      message: `Branch deactivated. ${linkedEmployees} employee(s) are currently assigned to this branch.`,
      data: branch,
    });
  }

  // Hard delete if no employees are assigned
  await branch.deleteOne();

  res.status(200).json({
    success: true,
    message: "Branch removed successfully",
    data: {},
  });
});
