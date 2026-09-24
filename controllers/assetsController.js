const Asset = require("../models/Asset");
const AssetCategory = require("../models/AssetCategory");
const AssetAssignment = require("../models/AssetAssignment");
const AssetMaintenance = require("../models/AssetMaintenance");
const Employee = require("../models/Employee");
const EmployeeTimeline = require("../models/EmployeeTimeline");
const Log = require("../models/Log");
const { sendNotification } = require("../services/notificationService");

// Default category seeds
const DEFAULT_CATEGORIES = [
  { name: "Laptop", code: "LAP", icon: "Laptop", description: "Portable laptops & notebooks" },
  { name: "Desktop", code: "DT", icon: "Monitor", description: "Workstation PCs" },
  { name: "Monitor", code: "MON", icon: "Tv", description: "Display screens & monitors" },
  { name: "Mobile Phone", code: "MOB", icon: "Smartphone", description: "Company mobile devices" },
  { name: "Tablet", code: "TAB", icon: "Tablet", description: "Tablets & iPads" },
  { name: "SIM Card", code: "SIM", icon: "Cpu", description: "Cellular SIM cards" },
  { name: "ID Card", code: "IDC", icon: "CreditCard", description: "Employee photo identity badges" },
  { name: "Access Card", code: "ACC", icon: "Key", description: "Building & door access cards" },
  { name: "Keyboard & Mouse", code: "KBM", icon: "Keyboard", description: "Input peripherals" },
  { name: "Headset", code: "HDS", icon: "Headphones", description: "Audio headsets" },
  { name: "Printer", code: "PRN", icon: "Printer", description: "Office printers & scanners" },
  { name: "Software License", code: "LIC", icon: "FileCode", description: "Software & cloud subscriptions" },
  { name: "Office Furniture", code: "FUR", icon: "Armchair", description: "Desks, chairs & ergonomic furniture" },
  { name: "Other", code: "OTH", icon: "Box", description: "Miscellaneous equipment" },
];

// Seed default categories if collection is empty
const ensureDefaultCategories = async () => {
  try {
    const count = await AssetCategory.countDocuments();
    if (count === 0) {
      await AssetCategory.insertMany(DEFAULT_CATEGORIES);
      console.log("✅ Default asset categories initialized.");
    }
  } catch (err) {
    console.error("Error seeding default asset categories:", err);
  }
};

// @desc    Get Asset Dashboard Statistics
// @route   GET /api/assets/dashboard
// @access  Private (Admin, HR, Manager)
exports.getAssetDashboardStats = async (req, res) => {
  try {
    await ensureDefaultCategories();

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const [
      totalAssets,
      assignedAssets,
      availableAssets,
      underMaintenance,
      damagedAssets,
      lostAssets,
      retiredAssets,
      warrantyExpiringCount,
      recentAssignments,
      recentMaintenances,
      categoryCounts,
    ] = await Promise.all([
      Asset.countDocuments({ status: { $ne: "DISPOSED" } }),
      Asset.countDocuments({ status: "ASSIGNED" }),
      Asset.countDocuments({ status: "AVAILABLE" }),
      Asset.countDocuments({ status: "UNDER_MAINTENANCE" }),
      Asset.countDocuments({ status: "DAMAGED" }),
      Asset.countDocuments({ status: "LOST" }),
      Asset.countDocuments({ status: "RETIRED" }),
      Asset.countDocuments({
        status: { $in: ["AVAILABLE", "ASSIGNED"] },
        warrantyExpiry: { $gte: new Date(), $lte: thirtyDaysFromNow },
      }),
      AssetAssignment.find({})
        .populate("assetId", "name assetId category")
        .populate("employeeId", "fullName officialEmail email department")
        .populate("assignedBy", "fullName")
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
      AssetMaintenance.find({})
        .populate("assetId", "name assetId category")
        .populate("performedBy", "fullName")
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
      Asset.aggregate([
        { $match: { status: { $ne: "DISPOSED" } } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
    ]);

    // Populate category counts with category details
    const categoryIds = categoryCounts.map((c) => c._id);
    const categories = await AssetCategory.find({ _id: { $in: categoryIds } }).lean();
    const categoryStats = categoryCounts.map((c) => {
      const catObj = categories.find((cat) => cat._id.toString() === c._id?.toString());
      return {
        categoryId: c._id,
        name: catObj ? catObj.name : "Uncategorized",
        code: catObj ? catObj.code : "OTH",
        icon: catObj ? catObj.icon : "Box",
        count: c.count,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        totalAssets,
        assignedAssets,
        availableAssets,
        underMaintenance,
        damagedAssets,
        lostAssets,
        retiredAssets,
        warrantyExpiringCount,
        categoryStats,
        recentAssignments,
        recentMaintenances,
      },
    });
  } catch (err) {
    console.error("Error fetching asset dashboard stats:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get Asset Inventory List with Search, Filter & Pagination
// @route   GET /api/assets
// @access  Private (Admin, HR, Manager)
exports.getAssets = async (req, res) => {
  try {
    await ensureDefaultCategories();

    const {
      search,
      status,
      category,
      condition,
      officeLocation,
      employeeId,
      warrantyExpiring,
      page = 1,
      limit = 50,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (category) {
      query.category = category;
    }

    if (condition) {
      query.condition = condition;
    }

    if (officeLocation) {
      query.officeLocation = new RegExp(officeLocation, "i");
    }

    if (employeeId) {
      query.currentAssignee = employeeId;
    }

    if (warrantyExpiring === "true") {
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() + 30);
      query.warrantyExpiry = { $gte: new Date(), $lte: thirtyDays };
    }

    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { name: searchRegex },
        { assetId: searchRegex },
        { serialNumber: searchRegex },
        { brand: searchRegex },
        { model: searchRegex },
        { vendor: searchRegex },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [assets, total] = await Promise.all([
      Asset.find(query)
        .populate("category", "name code icon")
        .populate("currentAssignee", "fullName email officialEmail department role")
        .populate("createdBy", "fullName")
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Asset.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      count: assets.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      data: assets,
    });
  } catch (err) {
    console.error("Error fetching asset inventory:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Get Single Asset by ID with complete ledger history
// @route   GET /api/assets/:id
// @access  Private (Admin, HR, Manager)
exports.getAssetById = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id)
      .populate("category", "name code icon description")
      .populate("currentAssignee", "fullName email officialEmail department role biometricCode")
      .populate("createdBy", "fullName email");

    if (!asset) {
      return res.status(404).json({ success: false, message: "Asset not found" });
    }

    const [assignmentHistory, maintenanceHistory] = await Promise.all([
      AssetAssignment.find({ assetId: asset._id })
        .populate("employeeId", "fullName email officialEmail department role")
        .populate("assignedBy", "fullName")
        .populate("returnedBy", "fullName")
        .sort({ createdAt: -1 })
        .lean(),
      AssetMaintenance.find({ assetId: asset._id })
        .populate("performedBy", "fullName")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        asset,
        assignmentHistory,
        maintenanceHistory,
      },
    });
  } catch (err) {
    console.error("Error fetching asset details:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Create New Asset Record
// @route   POST /api/assets
// @access  Private (Admin, HR)
exports.createAsset = async (req, res) => {
  try {
    const {
      assetId,
      name,
      category,
      brand,
      model,
      serialNumber,
      purchaseDate,
      warrantyExpiry,
      purchaseCost,
      vendor,
      officeLocation,
      condition,
      notes,
    } = req.body;

    // Verify Asset ID uniqueness
    let customAssetId = assetId ? assetId.toUpperCase().trim() : null;

    if (!customAssetId) {
      // Auto-generate Asset ID
      const catObj = await AssetCategory.findById(category);
      const prefix = catObj ? catObj.code : "AST";
      const count = await Asset.countDocuments();
      customAssetId = `AST-${prefix}-${String(count + 1).padStart(4, "0")}`;
    } else {
      const existing = await Asset.findOne({ assetId: customAssetId });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Asset ID '${customAssetId}' already exists.`,
        });
      }
    }

    const asset = await Asset.create({
      assetId: customAssetId,
      name,
      category,
      brand,
      model,
      serialNumber,
      purchaseDate: purchaseDate || null,
      warrantyExpiry: warrantyExpiry || null,
      purchaseCost: purchaseCost || 0,
      vendor,
      officeLocation: officeLocation || "Main Office",
      condition: condition || "NEW",
      notes,
      status: "AVAILABLE",
      createdBy: req.user.id,
    });

    // Write Audit Event
    await Log.create({
      action: "ASSET_CREATED",
      performedBy: req.user.id,
      affectedResource: "Asset",
      resourceId: asset._id,
      newState: asset.toObject(),
      status: "SUCCESS",
    });

    res.status(201).json({
      success: true,
      message: "Asset created successfully",
      data: asset,
    });
  } catch (err) {
    console.error("Error creating asset:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update Asset Metadata
// @route   PUT /api/assets/:id
// @access  Private (Admin, HR)
exports.updateAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({ success: false, message: "Asset not found" });
    }

    const previousState = asset.toObject();

    // Fields allowed to update
    const allowedFields = [
      "name",
      "category",
      "brand",
      "model",
      "serialNumber",
      "purchaseDate",
      "warrantyExpiry",
      "purchaseCost",
      "vendor",
      "status",
      "officeLocation",
      "condition",
      "notes",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        asset[field] = req.body[field];
      }
    });

    await asset.save();

    // Audit log
    await Log.create({
      action: "ASSET_UPDATED",
      performedBy: req.user.id,
      affectedResource: "Asset",
      resourceId: asset._id,
      previousState,
      newState: asset.toObject(),
      status: "SUCCESS",
    });

    res.status(200).json({
      success: true,
      message: "Asset updated successfully",
      data: asset,
    });
  } catch (err) {
    console.error("Error updating asset:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Assign Asset to Employee
// @route   POST /api/assets/:id/assign
// @access  Private (Admin, HR)
exports.assignAsset = async (req, res) => {
  try {
    const { employeeId, expectedReturnDate, assignmentNotes } = req.body;

    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({ success: false, message: "Asset not found" });
    }

    if (asset.status === "ASSIGNED") {
      return res.status(400).json({
        success: false,
        message: "Asset is already assigned to another employee",
      });
    }

    if (["RETIRED", "DISPOSED"].includes(asset.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot assign asset in '${asset.status}' state`,
      });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    // 1. Create Active Assignment Record
    const assignment = await AssetAssignment.create({
      assetId: asset._id,
      employeeId: employee._id,
      assignedBy: req.user.id,
      assignedDate: new Date(),
      expectedReturnDate: expectedReturnDate || null,
      assignmentNotes: assignmentNotes || "",
      status: "ACTIVE",
    });

    // 2. Update Asset State
    asset.status = "ASSIGNED";
    asset.currentAssignee = employee._id;
    asset.currentAssignmentDate = new Date();
    await asset.save();

    // 3. Publish Event to EmployeeTimeline
    await EmployeeTimeline.logEvent({
      employeeId: employee._id,
      eventType: "ASSET_ASSIGNED",
      title: `Asset Assigned: ${asset.name} (${asset.assetId})`,
      description: `Equipment (${asset.brand || ""} ${asset.model || ""}) assigned to employee. Serial #: ${asset.serialNumber || "N/A"}.`,
      category: "ASSETS",
      metadata: {
        assetId: asset._id,
        assetCode: asset.assetId,
        assetName: asset.name,
        assignmentId: assignment._id,
      },
      performedBy: req.user.id,
    });

    // 4. Audit Log
    await Log.create({
      action: "ASSET_ASSIGNED",
      performedBy: req.user.id,
      affectedResource: "Asset",
      resourceId: asset._id,
      details: {
        employeeName: employee.fullName,
        employeeId: employee._id,
        assetCode: asset.assetId,
      },
      status: "SUCCESS",
    });

    // 5. Send Notification
    try {
      await sendNotification({
        recipient: employee.userId || employee._id,
        title: "New Company Asset Assigned",
        message: `Asset "${asset.name}" (${asset.assetId}) has been assigned to you.`,
        type: "ASSET_ASSIGNMENT",
      });
    } catch (nErr) {
      console.error("Asset notification error:", nErr.message);
    }

    res.status(200).json({
      success: true,
      message: `Asset '${asset.name}' assigned to ${employee.fullName} successfully.`,
      data: { asset, assignment },
    });
  } catch (err) {
    console.error("Error assigning asset:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Return Assigned Asset
// @route   POST /api/assets/:id/return
// @access  Private (Admin, HR)
exports.returnAsset = async (req, res) => {
  try {
    const { returnCondition, returnRemarks, nextStatus } = req.body;

    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({ success: false, message: "Asset not found" });
    }

    if (asset.status !== "ASSIGNED" || !asset.currentAssignee) {
      return res.status(400).json({
        success: false,
        message: "Asset is not currently assigned",
      });
    }

    const employeeId = asset.currentAssignee;
    const employee = await Employee.findById(employeeId);

    // 1. Close Active Assignment Record
    const activeAssignment = await AssetAssignment.findOne({
      assetId: asset._id,
      employeeId: employeeId,
      status: "ACTIVE",
    });

    if (activeAssignment) {
      activeAssignment.status = "RETURNED";
      activeAssignment.actualReturnDate = new Date();
      activeAssignment.returnCondition = returnCondition || "GOOD";
      activeAssignment.returnRemarks = returnRemarks || "";
      activeAssignment.returnedBy = req.user.id;
      await activeAssignment.save();
    }

    // 2. Update Asset Record State
    const targetStatus = nextStatus || (["DAMAGED", "DEFECTIVE"].includes(returnCondition) ? "UNDER_MAINTENANCE" : "AVAILABLE");
    asset.status = targetStatus;
    if (returnCondition) asset.condition = returnCondition;
    asset.currentAssignee = null;
    asset.currentAssignmentDate = null;
    await asset.save();

    // 3. Publish Event to EmployeeTimeline
    if (employee) {
      await EmployeeTimeline.logEvent({
        employeeId: employee._id,
        eventType: "ASSET_RETURNED",
        title: `Asset Returned: ${asset.name} (${asset.assetId})`,
        description: `Equipment returned in ${returnCondition || "GOOD"} condition. Remarks: ${returnRemarks || "None"}.`,
        category: "ASSETS",
        metadata: {
          assetId: asset._id,
          assetCode: asset.assetId,
          returnCondition,
          returnRemarks,
        },
        performedBy: req.user.id,
      });
    }

    // 4. Audit Log
    await Log.create({
      action: "ASSET_RETURNED",
      performedBy: req.user.id,
      affectedResource: "Asset",
      resourceId: asset._id,
      details: {
        employeeName: employee ? employee.fullName : "Unknown",
        assetCode: asset.assetId,
        returnCondition,
      },
      status: "SUCCESS",
    });

    res.status(200).json({
      success: true,
      message: `Asset '${asset.name}' returned successfully. Status set to '${targetStatus}'.`,
      data: asset,
    });
  } catch (err) {
    console.error("Error returning asset:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Add Asset Maintenance Record
// @route   POST /api/assets/:id/maintenance
// @access  Private (Admin, HR)
exports.addMaintenance = async (req, res) => {
  try {
    const { repairDate, vendor, cost, description, status, notes } = req.body;

    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({ success: false, message: "Asset not found" });
    }

    const maintenance = await AssetMaintenance.create({
      assetId: asset._id,
      repairDate: repairDate || new Date(),
      vendor: vendor || "",
      cost: cost || 0,
      description,
      status: status || "IN_PROGRESS",
      notes: notes || "",
      performedBy: req.user.id,
      completionDate: status === "COMPLETED" ? new Date() : null,
    });

    // Automatically update asset status if maintenance is in progress
    if (["SCHEDULED", "IN_PROGRESS"].includes(maintenance.status) && asset.status !== "ASSIGNED") {
      asset.status = "UNDER_MAINTENANCE";
      await asset.save();
    }

    // Audit log
    await Log.create({
      action: "ASSET_MAINTENANCE_CREATED",
      performedBy: req.user.id,
      affectedResource: "Asset",
      resourceId: asset._id,
      details: { description, cost, vendor },
      status: "SUCCESS",
    });

    res.status(201).json({
      success: true,
      message: "Maintenance record added successfully",
      data: maintenance,
    });
  } catch (err) {
    console.error("Error adding asset maintenance:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update Maintenance Status
// @route   PUT /api/assets/maintenance/:maintenanceId
// @access  Private (Admin, HR)
exports.updateMaintenance = async (req, res) => {
  try {
    const { status, completionDate, cost, notes } = req.body;

    const maintenance = await AssetMaintenance.findById(req.params.maintenanceId);
    if (!maintenance) {
      return res.status(404).json({ success: false, message: "Maintenance record not found" });
    }

    if (status) maintenance.status = status;
    if (cost !== undefined) maintenance.cost = cost;
    if (notes !== undefined) maintenance.notes = notes;
    if (status === "COMPLETED" && !maintenance.completionDate) {
      maintenance.completionDate = completionDate || new Date();
    }

    await maintenance.save();

    // If completed and asset was UNDER_MAINTENANCE, restore to AVAILABLE
    if (status === "COMPLETED") {
      const asset = await Asset.findById(maintenance.assetId);
      if (asset && asset.status === "UNDER_MAINTENANCE") {
        asset.status = "AVAILABLE";
        await asset.save();
      }
    }

    res.status(200).json({
      success: true,
      message: "Maintenance record updated successfully",
      data: maintenance,
    });
  } catch (err) {
    console.error("Error updating asset maintenance:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get All Asset Categories
// @route   GET /api/assets/categories
// @access  Private (All Roles)
exports.getCategories = async (req, res) => {
  try {
    await ensureDefaultCategories();
    const categories = await AssetCategory.find({ isActive: true }).sort({ name: 1 });
    res.status(200).json({ success: true, count: categories.length, data: categories });
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Create Asset Category
// @route   POST /api/assets/categories
// @access  Private (Admin, HR)
exports.createCategory = async (req, res) => {
  try {
    const { name, code, description, icon } = req.body;
    const category = await AssetCategory.create({
      name,
      code: code ? code.toUpperCase().trim() : name.slice(0, 3).toUpperCase(),
      description: description || "",
      icon: icon || "Box",
    });
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    console.error("Error creating category:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get Assets assigned to an Employee
// @route   GET /api/assets/employee/:employeeId
// @access  Private (Admin, HR, Manager of employee, Employee self)
exports.getEmployeeAssets = async (req, res) => {
  try {
    const employeeId = req.params.employeeId;

    const [currentAssets, assignmentHistory] = await Promise.all([
      Asset.find({ currentAssignee: employeeId, status: "ASSIGNED" })
        .populate("category", "name code icon")
        .sort({ currentAssignmentDate: -1 })
        .lean(),
      AssetAssignment.find({ employeeId })
        .populate("assetId", "name assetId category brand model serialNumber")
        .populate("assignedBy", "fullName")
        .populate("returnedBy", "fullName")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        currentAssets,
        assignmentHistory,
      },
    });
  } catch (err) {
    console.error("Error fetching employee assets:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Exit Management Check: Pending Unreturned Assets
// @route   GET /api/assets/employee/:employeeId/pending
// @access  Private (Admin, HR)
exports.checkPendingAssetsForExit = async (req, res) => {
  try {
    const employeeId = req.params.employeeId;
    const pendingAssets = await Asset.find({
      currentAssignee: employeeId,
      status: "ASSIGNED",
    })
      .populate("category", "name code icon")
      .lean();

    const isClear = pendingAssets.length === 0;

    res.status(200).json({
      success: true,
      data: {
        isClear,
        pendingCount: pendingAssets.length,
        pendingAssets,
      },
    });
  } catch (err) {
    console.error("Error checking pending assets for exit clearance:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
