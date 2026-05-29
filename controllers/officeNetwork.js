const OfficeNetwork = require("../models/OfficeNetwork");
const asyncHandler = require("../middleware/async");
const { refreshCache } = require("../middleware/ipFilter");

// @desc    Get all office networks
// @route   GET /api/office-networks
// @access  Private/Admin
exports.getOfficeNetworks = asyncHandler(async (req, res, next) => {
  const officeNetworks = await OfficeNetwork.find().populate(
    "createdBy",
    "fullName email"
  );

  res.status(200).json({
    success: true,
    data: officeNetworks,
  });
});

// @desc    Create new office network
// @route   POST /api/office-networks
// @access  Private/Admin
exports.createOfficeNetwork = asyncHandler(async (req, res, next) => {
  req.body.createdBy = req.user.id;

  const officeNetwork = await OfficeNetwork.create(req.body);

  // Invalidate in-memory IP filter cache immediately
  await refreshCache();

  res.status(201).json({
    success: true,
    data: officeNetwork,
  });
});

// @desc    Update office network
// @route   PUT /api/office-networks/:id
// @access  Private/Admin
exports.updateOfficeNetwork = asyncHandler(async (req, res, next) => {
  let officeNetwork = await OfficeNetwork.findById(req.params.id);

  if (!officeNetwork) {
    return res.status(404).json({
      success: false,
      message: "Office network not found",
    });
  }

  officeNetwork = await OfficeNetwork.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  // Invalidate in-memory IP filter cache immediately
  await refreshCache();

  res.status(200).json({
    success: true,
    data: officeNetwork,
  });
});

// @desc    Delete office network
// @route   DELETE /api/office-networks/:id
// @access  Private/Admin
exports.deleteOfficeNetwork = asyncHandler(async (req, res, next) => {
  const officeNetwork = await OfficeNetwork.findById(req.params.id);

  if (!officeNetwork) {
    return res.status(404).json({
      success: false,
      message: "Office network not found",
    });
  }

  await officeNetwork.deleteOne();

  // Invalidate in-memory IP filter cache immediately
  await refreshCache();

  res.status(200).json({
    success: true,
    data: {},
  });
});
