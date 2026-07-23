const Employee = require("../models/Employee");
const Department = require("../models/Department");
const Role = require("../models/EmployeeRole");
const User = require("../models/User");
const EmploymentHistory = require("../models/EmploymentHistory");
const EmployeeTimeline = require("../models/EmployeeTimeline");
const Log = require("../models/Log");
const fs = require("fs");
const path = require("path");
const fileStorage = require("../services/fileStorageService");
const { decrypt } = require("../utils/encryption");
const { notifyAdmins } = require("../services/notificationService");
const trackChanges = require("../utils/changeTracker");
const { sendWelcomeEmail } = require("../services/emailService");
const Attendance = require("../models/Attendance");
const PerformanceReview = require("../models/PerformanceReview");
const PromotionRequest = require("../models/PromotionRequest");
const SalaryHistory = require("../models/SalaryHistory");
const MonthlyPerformanceRecord = require("../models/MonthlyPerformanceRecord");
const Asset = require("../models/Asset");
const AssetAssignment = require("../models/AssetAssignment");
const ExitRequest = require("../models/ExitRequest");

// Export multer upload middleware
exports.uploadEmployeeFiles = fileStorage.uploadMiddleware.fields([
  { name: "photograph", maxCount: 1 },
  { name: "tenthMarksheet", maxCount: 1 },
  { name: "twelfthMarksheet", maxCount: 1 },
  { name: "bachelorDegree", maxCount: 1 },
  { name: "postgraduateDegree", maxCount: 1 },
  { name: "aadharCard", maxCount: 1 },
  { name: "panCard", maxCount: 1 },
  { name: "pcc", maxCount: 1 },
  { name: "resume", maxCount: 1 },
  { name: "offerLetter", maxCount: 1 },
  { name: "signature", maxCount: 1 },
]);

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private
exports.getEmployees = async (req, res) => {
  try {
    let query;

    // Copy req.query
    const reqQuery = { ...req.query };

    // Fields to exclude
    const removeFields = ["select", "sort", "page", "limit"];

    // Loop over removeFields and delete them from reqQuery
    removeFields.forEach((param) => delete reqQuery[param]);

    // Create query string
    let queryStr = JSON.stringify(reqQuery);

    // Create operators ($gt, $gte, etc)
    queryStr = queryStr.replace(
      /\b(gt|gte|lt|lte|in)\b/g,
      (match) => `$${match}`,
    );

    // Role-based filtering
    if (req.user.role === "HR") {
      // HR can see employees they manage or all if no hrId restriction
      query = Employee.find(JSON.parse(queryStr));
    } else if (req.user.role === "Admin" || req.user.role === "Manager") {
      // Admin and Manager can see all employees
      query = Employee.find(JSON.parse(queryStr));
    } else {
      // Other users can see all employees (for profile viewing)
      query = Employee.find(JSON.parse(queryStr));
    }

    // Populate role and department for all queries
    query = query
      .populate("role", "name description")
      .populate("department", "name description");

    // Select Fields
    if (req.query.select) {
      const fields = req.query.select.split(",").join(" ");
      query = query.select(fields);
    }

    // Sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(",").join(" ");
      query = query.sort(sortBy);
    } else {
      query = query.sort("-createdAt");
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Employee.countDocuments();

    query = query.skip(startIndex).limit(limit);

    // Executing query
    const employees = await query;

    // Fix employmentType for IT Interns if incorrect (auto-fix on fetch)
    // Since role is already populated, we can check directly
    const employeesToFix = [];
    for (const emp of employees) {
      if (emp.role && typeof emp.role === "object" && emp.role.name) {
        if (emp.role.name === "IT Intern" && emp.employmentType !== "INTERN") {
          employeesToFix.push({ id: emp._id, type: "INTERN" });
          emp.employmentType = "INTERN"; // Update in memory immediately
        } else if (
          emp.role.name === "IT Permanent" &&
          emp.employmentType !== "PERMANENT"
        ) {
          employeesToFix.push({ id: emp._id, type: "PERMANENT" });
          emp.employmentType = "PERMANENT"; // Update in memory immediately
        }
      }
    }

    // Batch update in database (more efficient)
    if (employeesToFix.length > 0) {
      console.log(
        `Auto-fixing employmentType for ${employeesToFix.length} employees`,
      );
      const updatePromises = employeesToFix.map(({ id, type }) =>
        Employee.findByIdAndUpdate(
          id,
          { employmentType: type },
          { new: false },
        ),
      );
      await Promise.all(updatePromises);
    }

    // Transform employees: map individual document fields to documents object
    const transformedEmployees = employees.map((emp) => {
      const empObj = emp.toObject();

      // Decrypt PII fields for authorized users (Admin, HR, Manager, IT Manager)
      if (["Admin", "HR", "Manager", "IT Manager"].includes(req.user.role)) {
        const decrypted = emp.getDecryptedPII();
        Object.assign(empObj, decrypted);
      }

      // If documents object is empty but individual fields exist, map them
      if (
        (!empObj.documents || Object.keys(empObj.documents).length === 0) &&
        (empObj.photograph ||
          empObj.aadharCard ||
          empObj.panCard ||
          empObj.resume ||
          empObj.signature)
      ) {
        empObj.documents = {
          photograph: empObj.photograph,
          tenthMarksheet: empObj.tenthMarksheet,
          twelfthMarksheet: empObj.twelfthMarksheet,
          bachelorDegree: empObj.bachelorDegree,
          postgraduateDegree: empObj.postgraduateDegree,
          aadharCard: empObj.aadharCard,
          panCard: empObj.panCard,
          pcc: empObj.pcc,
          resume: empObj.resume,
          offerLetter: empObj.offerLetter,
          signature: empObj.signature,
        };
      }
      return empObj;
    });

    // Pagination result
    const pagination = {};

    if (endIndex < total) {
      pagination.next = {
        page: page + 1,
        limit,
      };
    }

    if (startIndex > 0) {
      pagination.prev = {
        page: page - 1,
        limit,
      };
    }

    res.status(200).json({
      success: true,
      count: transformedEmployees.length,
      pagination,
      data: transformedEmployees,
    });
  } catch (err) {
    console.error("Error fetching employees:", err);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Get single employee
// @route   GET /api/employees/:id
// @access  Private
exports.getEmployee = async (req, res) => {
  try {
    console.log("Fetching employee with ID:", req.params.id);

    const employee = await Employee.findById(req.params.id)
      .populate("department", "name description")
      .populate("role", "name description")
      .populate("hrId", "fullName email");

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    console.log("Found employee data:", {
      id: employee._id,
      fullName: employee.fullName,
      email: employee.email,
      hasDocuments: {
        photograph: !!employee.photograph,
        tenthMarksheet: !!employee.tenthMarksheet,
        aadharCard: !!employee.aadharCard,
        panCard: !!employee.panCard,
        pcc: !!employee.pcc,
        resume: !!employee.resume,
        offerLetter: !!employee.offerLetter,
      },
    });

    // Check authorization - Allow HR, Admin, Manager, IT Manager, and users viewing their own profile
    if (
      req.user.role === "HR" ||
      req.user.role === "Admin" ||
      req.user.role === "Manager" ||
      req.user.role === "IT Manager" ||
      employee.userId?.toString() === req.user.id
    ) {
      // Authorized
    } else {
      // Allow all users to view employee data for profile purposes
      // This enables the profile page to show employee information
    }

    // Transform: map individual document fields to documents object
    const empObj = employee.toObject();
    
    // Decrypt PII fields for authorized users (Admin, HR, Manager, IT Manager) AND for users viewing their own profile
    if (
      ["Admin", "HR", "Manager", "IT Manager"].includes(req.user.role) ||
      employee.userId?.toString() === req.user.id
    ) {
      const decrypted = employee.getDecryptedPII();
      Object.assign(empObj, decrypted);
    }

    if (
      (!empObj.documents || Object.keys(empObj.documents).length === 0) &&
      (empObj.photograph ||
        empObj.aadharCard ||
        empObj.panCard ||
        empObj.resume ||
        empObj.signature)
    ) {
      empObj.documents = {
        photograph: empObj.photograph,
        tenthMarksheet: empObj.tenthMarksheet,
        twelfthMarksheet: empObj.twelfthMarksheet,
        bachelorDegree: empObj.bachelorDegree,
        postgraduateDegree: empObj.postgraduateDegree,
        aadharCard: empObj.aadharCard,
        panCard: empObj.panCard,
        pcc: empObj.pcc,
        resume: empObj.resume,
        offerLetter: empObj.offerLetter,
        signature: empObj.signature,
      };
    }

    res.status(200).json({
      success: true,
      data: empObj,
    });
  } catch (err) {
    console.error("Error fetching employee:", err);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Get employee by user ID
// @route   GET /api/employees/user/:userId
// @access  Private
exports.getEmployeeByUserId = async (req, res) => {
  try {
    console.log("Fetching employee by user ID:", req.params.userId);

    const employee = await Employee.findOne({ userId: req.params.userId })
      .populate("department", "name description")
      .populate("role", "name description")
      .populate("hrId", "fullName email");

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found for this user",
      });
    }

    console.log("Found employee by userId:", {
      id: employee._id,
      fullName: employee.fullName,
      email: employee.email,
      hasDocuments: {
        photograph: !!employee.photograph,
        tenthMarksheet: !!employee.tenthMarksheet,
        aadharCard: !!employee.aadharCard,
        panCard: !!employee.panCard,
        pcc: !!employee.pcc,
        resume: !!employee.resume,
        offerLetter: !!employee.offerLetter,
      },
    });

    // Check authorization - Allow HR, Admin, Manager, IT Manager, and users viewing their own profile
    if (
      req.user.role === "HR" ||
      req.user.role === "Admin" ||
      req.user.role === "Manager" ||
      req.user.role === "IT Manager" ||
      employee.userId?.toString() === req.user.id
    ) {
      // Authorized
    } else {
      // Allow all users to view employee data for profile purposes
    }

    // Transform: map individual document fields to documents object
    const empObj = employee.toObject();

    // Decrypt PII fields for authorized users (Admin, HR, Manager, IT Manager) AND for users viewing their own profile
    if (
      ["Admin", "HR", "Manager", "IT Manager"].includes(req.user.role) ||
      employee.userId?.toString() === req.user.id
    ) {
      const decrypted = employee.getDecryptedPII();
      Object.assign(empObj, decrypted);
    }

    if (
      (!empObj.documents || Object.keys(empObj.documents).length === 0) &&
      (empObj.photograph ||
        empObj.aadharCard ||
        empObj.panCard ||
        empObj.resume ||
        empObj.signature)
    ) {
      empObj.documents = {
        photograph: empObj.photograph,
        tenthMarksheet: empObj.tenthMarksheet,
        twelfthMarksheet: empObj.twelfthMarksheet,
        bachelorDegree: empObj.bachelorDegree,
        postgraduateDegree: empObj.postgraduateDegree,
        aadharCard: empObj.aadharCard,
        panCard: empObj.panCard,
        pcc: empObj.pcc,
        resume: empObj.resume,
        offerLetter: empObj.offerLetter,
        signature: empObj.signature,
      };
    }

    res.status(200).json({
      success: true,
      data: empObj,
    });
  } catch (err) {
    console.error("Error fetching employee by userId:", err);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Get team directory (sanitized - no PII, accessible to all authenticated users)
// @route   GET /api/employees/team-directory
// @access  Private (all roles)
exports.getTeamDirectory = async (req, res) => {
  try {
    const employees = await Employee.find({})
      .populate('department', 'name')
      .populate('role', 'name description')
      .populate('hrId', 'fullName email')
      .lean();

    // Find all Managers and Admins to use as potential reporting managers
    const managersAndAdmins = employees.filter(emp => {
      const roleName = emp.role?.name?.toLowerCase() || '';
      return roleName.includes('manager') || roleName.includes('admin');
    });

    const admins = managersAndAdmins.filter(emp => 
      emp.role?.name?.toLowerCase().includes('admin')
    );

    // Strip all PII and sensitive fields, keep only public work-context data
    const sanitized = employees.map((emp) => {
      const roleName = emp.role?.name?.toLowerCase() || '';
      const isManager = roleName.includes('manager') && !roleName.includes('admin');
      const isAdmin = roleName.includes('admin');
      
      let reportingManager = null;
      
      if (isAdmin) {
        // For Admin: show self or another Admin
        reportingManager = emp.fullName;
      } else if (isManager) {
        // For Manager: show Admin
        reportingManager = admins.length > 0 ? admins[0].fullName : 'Admin';
      } else {
        // For regular employees: show Department Manager
        const deptManager = managersAndAdmins.find(m => 
          m.department?._id?.toString() === emp.department?._id?.toString() &&
          m.role?.name?.toLowerCase().includes('manager') &&
          !m.role?.name?.toLowerCase().includes('admin')
        );
        reportingManager = deptManager ? deptManager.fullName : (admins.length > 0 ? admins[0].fullName : 'Admin');
      }

      return {
        _id: emp._id,
        fullName: emp.fullName,
        email: emp.email,
        role: emp.role,
        department: emp.department,
        status: emp.status,
        employmentType: emp.employmentType,
        joiningDate: emp.joiningDate,
        exitDate: emp.exitDate || null,
        skills: emp.skills || [],
        linkedInUrl: emp.linkedInUrl || null,
        photograph: emp.photograph || null,
        biometricCode: emp.biometricCode || null,
        projectAssignments: emp.projectAssignments || [],
        collegeName: emp.collegeName || null,
        reportingManager: reportingManager, // Logic as requested
        internshipDuration: emp.internshipDuration || null,
        internshipStartDate: emp.internshipStartDate || null,
        internshipEndDate: emp.internshipEndDate || null,
        hrId: emp.hrId || null,
        userId: emp.userId || null,
        createdAt: emp.createdAt,
      };
    });

    // Sort by name as a default secondary sort
    sanitized.sort((a, b) => a.fullName.localeCompare(b.fullName));

    res.status(200).json({
      success: true,
      count: sanitized.length,
      data: sanitized,
    });
  } catch (err) {
    console.error('Error fetching team directory:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error',
    });
  }
};

// @desc    Create new employee
// @route   POST /api/employees
// @access  Private
exports.createEmployee = async (req, res) => {
  let employeeData = null;
  try {
    console.log("Create employee request received:", {
      body: req.body,
      files: req.files ? Object.keys(req.files) : "No files",
      contentType: req.headers["content-type"],
    });

    // Parse employee data from form
    employeeData =
      typeof req.body.employee === "string"
        ? JSON.parse(req.body.employee)
        : req.body;

    if (employeeData.paymentMode === "" || employeeData.paymentMode === null) {
      delete employeeData.paymentMode;
    }

    // Simplified logic: only link to current user if they are an Employee (e.g. self-onboarding)
    // Or if they are creating their own profile.
    // If an Admin/HR/Manager/IT Manager is creating an employee, we DON'T want to link it to their own creator account.
    if (
      !employeeData.userId &&
      !["HR", "Admin", "Manager", "IT Manager"].includes(req.user.role)
    ) {
      employeeData.userId = req.user.id;
    }

    // Safety check: if biometricCode is empty string or null, remove it to respect sparse index
    if (!employeeData.biometricCode || employeeData.biometricCode === "") {
      delete employeeData.biometricCode;
    }

    // Ensure fullName and email are set from user if creating own profile (fallback)
    if (employeeData.userId === req.user.id) {
      employeeData.fullName = employeeData.fullName || req.user.fullName;
      employeeData.email = employeeData.email || req.user.email;
    }

    // Add HR ID if user is HR
    if (req.user.role === "HR") {
      employeeData.hrId = req.user.id;
    }

    // Handle file uploads
    if (req.files) {
      console.log("Processing file uploads:", Object.keys(req.files));
      employeeData.documents = {}; // Initialize documents object
      for (const fieldName of Object.keys(req.files)) {
        const arr = req.files[fieldName];
        if (arr && arr[0]) {
          const file = arr[0];
          console.log(`Processing file ${fieldName}:`, {
            originalName: file.originalname,
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size,
            path: file.path,
          });
          try {
            const uploaded = await fileStorage.uploadEmployeeDoc(
              file,
              fieldName,
            );
            console.log(`File ${fieldName} uploaded successfully:`, uploaded);

            // Extract just the URL string if the result is an object
            // This prevents MongoDB "Cast to string failed" errors
            const fileValue =
              typeof uploaded === "object" && uploaded.url
                ? uploaded.url
                : uploaded;

            // Store in both individual field and documents object for consistency
            employeeData[fieldName] = fileValue;
            employeeData.documents[fieldName] = fileValue;

            console.log(`Set ${fieldName} to:`, fileValue);
          } catch (e) {
            console.error(`Upload failed for ${fieldName}:`, e.message);
          }
        }
      }
    } else {
      console.log("No files found in request");
    }

    if (employeeData.biometricCode) {
      const existingBiometric = await Employee.findOne({
        biometricCode: employeeData.biometricCode,
      });
      if (existingBiometric) {
        return res.status(400).json({
          success: false,
          message: "Biometric code already assigned to another employee",
        });
      }
    }

    // Create employee
    const employee = await Employee.create(employeeData);

    // Create user account if official email and password provided (admin function only)
    console.log("DEBUG: Checking if user account should be created:", {
      hasUsername: !!req.body.username,
      hasPassword: !!req.body.password,
      userRole: req.user.role,
      isAuthorized: ["HR", "Admin", "Manager"].includes(req.user.role)
    });

    if (
      req.body.username && // This field will hold the Official Email
      req.body.password &&
      ["HR", "Admin", "Manager"].includes(req.user.role)
    ) {
      const userData = {
        fullName: employeeData.fullName,
        email: req.body.username.toLowerCase().trim(), // Official Email for login
        password: req.body.password,
        role: "Employee",
        employeeId: employee._id,
      };

      const user = await User.create(userData);
      employee.userId = user._id;
      // We also save the official email in the employee record for reference if needed
      employee.officialEmail = req.body.username.toLowerCase().trim();
      await employee.save();

      // Trigger Welcome Email with credentials sent to PERSONAL EMAIL
      try {
        await sendWelcomeEmail(user, req.body.password, employeeData.email);
      } catch (emailError) {
        console.error("Welcome email failed to send:", emailError);
      }
    }

    // Notify Admins
    await notifyAdmins({
      type: "EMPLOYEE_CREATED",
      message: `New Employee Profile Created: ${employee.fullName} (${employee.email}) by ${req.user.fullName}`,
      employeeId: employee._id
    });

    // 🚀 Auto-trigger Onboarding Journey (fire-and-forget — never blocks response)
    try {
      const JourneyService = require("../services/journeyService");
      JourneyService.startJourney("Employee Onboarding", employee._id, req.user.id)
        .then(() => console.log(`✅ Onboarding journey started for ${employee.fullName}`))
        .catch((err) => console.error(`⚠️ Onboarding journey failed for ${employee.fullName}:`, err.message));
    } catch (journeyErr) {
      console.error("⚠️ Could not load JourneyService:", journeyErr.message);
    }

    // 🚀 HRMS V2 Foundation: Initial Employment History Entry
    try {
      await EmploymentHistory.create({
        employeeId: employee._id,
        changeType: "INITIAL_HIRE",
        fieldName: "all",
        newValue: {
          department: employee.department,
          role: employee.role,
          reportingManager: employee.reportingManager,
          employmentType: employee.employmentType,
          status: employee.status,
        },
        newValueText: `Hired as ${employee.employmentType || "PERMANENT"} (Status: ${employee.status || "ACTIVE"})`,
        changedBy: req.user.id || req.user._id,
        reason: req.body.reason || "Initial profile creation",
      });
    } catch (histErr) {
      console.error("Error creating initial EmploymentHistory record:", histErr);
    }

    // 🚀 HRMS V2 Foundation: Initial Employee Timeline Event
    try {
      await EmployeeTimeline.logEvent({
        employeeId: employee._id,
        eventType: "EMPLOYEE_CREATED",
        title: "Employee Profile Created",
        description: `Employee profile for ${employee.fullName} created by ${req.user.fullName || "Admin"}`,
        category: "EMPLOYMENT",
        metadata: {
          department: employee.department,
          role: employee.role,
          status: employee.status,
          employmentType: employee.employmentType,
          reportingManager: employee.reportingManager,
        },
        performedBy: req.user.id || req.user._id,
      });
    } catch (timeErr) {
      console.error("Error creating initial EmployeeTimeline event:", timeErr);
    }

    // 🚀 HRMS V2 Foundation: Audit Log Entry
    try {
      await Log.create({
        action: "EMPLOYEE_CREATED",
        performedBy: req.user.id || req.user._id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        affectedResource: "Employee",
        resourceId: employee._id,
        newState: employee.toObject(),
        details: {
          message: `Employee ${employee.fullName} created by ${req.user.fullName}`,
          reason: req.body.reason || "",
          isAdminOverride: req.user.role === "Admin",
        },
        status: "SUCCESS",
      });
    } catch (auditErr) {
      console.error("Error creating audit log entry:", auditErr);
    }

    res.status(201).json({
      success: true,
      data: employee,
    });
  } catch (err) {
    console.error("SERVER ERROR: Error creating employee:", err);
    if (err.name === "ValidationError") {
      console.error(
        "Validation Details:",
        Object.keys(err.errors).map((key) => ({
          field: key,
          message: err.errors[key].message,
          value: err.errors[key].value,
        })),
      );
    }
    console.log(
      "Employee data being processed when error occurred:",
      employeeData,
    );

    res.status(400).json({
      success: false,
      message: err.message,
      error: err,
      data: employeeData,
    });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    console.log("=== UPDATE EMPLOYEE REQUEST ===");
    console.log("Employee ID:", req.params.id);
    console.log("Request body:", req.body);
    console.log("Files:", req.files ? Object.keys(req.files) : "No files");

    let employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const oldEmployee = employee.toObject();

    // Check authorization - Allow only HR, Admin, and Manager to update employees
    // Also allow users to update their own profile
    if (
      !["HR", "Admin", "Manager"].includes(req.user.role) &&
      employee.userId?.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update employee profiles",
      });
    }

    // Parse employee data from form
    const employeeData = req.body.employee
      ? JSON.parse(req.body.employee)
      : req.body;

    console.log("Parsed employee data:", employeeData);

    // If role is being updated, ensure employmentType is correct
    if (employeeData.role) {
      const EmployeeRole = require("../models/EmployeeRole");
      const role = await EmployeeRole.findById(employeeData.role);
      if (role && role.name === "IT Intern") {
        employeeData.employmentType = "INTERN";
      } else if (role && role.name === "IT Permanent") {
        employeeData.employmentType = "PERMANENT";
      }
    }

    if (employeeData.biometricCode) {
      const existingBiometric = await Employee.findOne({
        biometricCode: employeeData.biometricCode,
        _id: { $ne: employee._id },
      });
      if (existingBiometric) {
        return res.status(400).json({
          success: false,
          message: "Biometric code already assigned to another employee",
        });
      }
    }

    // Handle file uploads
    if (req.files) {
      console.log("Processing file uploads:", Object.keys(req.files));
      for (const fieldName of Object.keys(req.files)) {
        const arr = req.files[fieldName];
        if (arr && arr[0]) {
          // delete old
          const oldInfo = employee[fieldName];
          if (oldInfo) {
            if (typeof oldInfo === "object") {
              await fileStorage.deleteEmployeeDoc(oldInfo);
            } else if (typeof oldInfo === "string" && fs.existsSync(oldInfo)) {
              fs.unlinkSync(oldInfo);
            }
          }
          const file = arr[0];
          try {
            const uploaded = await fileStorage.uploadEmployeeDoc(
              file,
              fieldName,
            );
            console.log(`Uploaded ${fieldName}:`, uploaded);

            // Extract just the URL string if the result is an object
            // This prevents MongoDB "Cast to string failed" errors
            const fileValue =
              typeof uploaded === "object" && uploaded.url
                ? uploaded.url
                : uploaded;

            employeeData[fieldName] = fileValue;

            console.log(`Set ${fieldName} to:`, fileValue);
          } catch (e) {
            console.error(`Upload failed for ${fieldName}:`, e.message);
          }
        }
      }
    }

    console.log("Final employee data to update:", employeeData);

    employee = await Employee.findByIdAndUpdate(req.params.id, employeeData, {
      new: true,
      runValidators: true,
    });

    console.log("Employee updated successfully");

    // Sync status change to user account active state
    if (employeeData.status && employeeData.status !== oldEmployee.status && employee.userId) {
      const isDeactivatedStatus = ["TERMINATED", "COMPLETED", "INACTIVE"].includes(employeeData.status);
      const User = require("../models/User");
      await User.findByIdAndUpdate(employee.userId, { active: !isDeactivatedStatus });
      console.log(`Synced user ${employee.userId} active state to ${!isDeactivatedStatus} because employee status became ${employee.status}`);
    }

    // Detailed Admin Notification
    const fieldLabels = {
      fullName: "Full Name",
      email: "Email",
      role: "Role",
      department: "Department",
      status: "Status",
      employmentType: "Employment Type",
      joiningDate: "Joining Date",
      phoneNumber: "Phone Number",
      personalEmail: "Personal Email"
    };

    // List of PII fields that are encrypted in the database
    const PII_FIELDS = [
      "phoneNumber",
      "whatsappNumber",
      "currentAddress",
      "permanentAddress",
      "dateOfBirth",
      "aadharCard",
      "panCard",
      "bankAccountNumber",
      "upiId",
    ];

    // Helper to decrypt fields for the change log comparison
    const decryptForLog = (obj) => {
      const decrypted = { ...obj };
      for (const field of PII_FIELDS) {
        if (decrypted[field]) {
          try {
            decrypted[field] = decrypt(decrypted[field]);
          } catch (e) {
            // If decryption fails, keep as is
          }
        }
      }
      return decrypted;
    };

    const changes = trackChanges(
      decryptForLog(oldEmployee),
      decryptForLog(employee.toObject()),
      fieldLabels,
    );

    if (changes.length > 0) {
      await notifyAdmins({
        type: "EMPLOYEE_UPDATED",
        message: `${req.user.fullName} updated profile for ${
          employee.fullName
        }. Changes: ${changes.join(", ")}`,
        employeeId: employee._id,
      });

      // 🚀 HRMS V2 Foundation: Track Employment History & Timeline Events
      try {
        const updateReason = req.body.reason || req.body.employee?.reason || "";
        const trackedFields = [
          { key: "department", changeType: "DEPARTMENT", title: "Department Changed" },
          { key: "role", changeType: "DESIGNATION", title: "Designation/Role Changed" },
          { key: "reportingManager", changeType: "REPORTING_MANAGER", title: "Reporting Manager Changed" },
          { key: "employmentType", changeType: "EMPLOYMENT_TYPE", title: "Employment Type Changed" },
          { key: "status", changeType: "STATUS", title: "Status Changed" },
        ];

        for (const item of trackedFields) {
          const fieldKey = item.key;
          const oldValObj = oldEmployee[fieldKey];
          const newValObj = employee[fieldKey];

          const oldId = (oldValObj?._id || oldValObj)?.toString();
          const newId = (newValObj?._id || newValObj)?.toString();

          if (oldId !== newId) {
            const oldText = oldValObj?.name || oldValObj?.fullName || (oldId ? oldId : "None");
            const newText = newValObj?.name || newValObj?.fullName || (newId ? newId : "None");

            // 1. Create EmploymentHistory record
            await EmploymentHistory.create({
              employeeId: employee._id,
              changeType: item.changeType,
              fieldName: fieldKey,
              previousValue: oldValObj,
              newValue: newValObj,
              previousValueText: oldText,
              newValueText: newText,
              effectiveDate: new Date(),
              changedBy: req.user.id || req.user._id,
              reason: updateReason,
            });

            // 2. Publish EmployeeTimeline event
            await EmployeeTimeline.logEvent({
              employeeId: employee._id,
              eventType: `${item.changeType}_CHANGED`,
              title: `${item.title}: ${newText}`,
              description: `${item.title} updated from "${oldText}" to "${newText}" by ${req.user.fullName}`,
              category: "EMPLOYMENT",
              metadata: {
                fieldName: fieldKey,
                previousValue: oldText,
                newValue: newText,
                reason: updateReason,
              },
              performedBy: req.user.id || req.user._id,
            });
          }
        }
      } catch (histErr) {
        console.error("Error logging EmploymentHistory/Timeline during update:", histErr);
      }

      // 🚀 HRMS V2 Foundation: Create Audit Log Entry
      try {
        await Log.create({
          action: "EMPLOYEE_UPDATED",
          performedBy: req.user.id || req.user._id,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          affectedResource: "Employee",
          resourceId: employee._id,
          previousState: oldEmployee,
          newState: employee.toObject(),
          details: {
            changes: changes,
            reason: req.body.reason || req.body.employee?.reason || "",
            isAdminOverride: req.user.role === "Admin",
          },
          status: "SUCCESS",
        });
      } catch (auditErr) {
        console.error("Error creating Log entry for update:", auditErr);
      }
    }

    res.status(200).json({
      success: true,
      data: employee,
    });
  } catch (err) {
    console.error("=== UPDATE EMPLOYEE ERROR ===");
    console.error("Error:", err);
    console.error("Error message:", err.message);
    console.error("Error name:", err.name);
    if (err.errors) {
      console.error("Validation errors:", err.errors);
    }

    res.status(400).json({
      success: false,
      message: err.message,
      error: err.name,
      validationErrors: err.errors,
    });
  }
};

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private
exports.deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Check authorization - Allow HR, Admin, and Manager to delete employees
    if (!["HR", "Admin", "Manager"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete employees",
      });
    }

    // Delete associated files
    const fileFields = [
      "photograph",
      "tenthMarksheet",
      "twelfthMarksheet",
      "bachelorDegree",
      "postgraduateDegree",
      "aadharCard",
      "panCard",
      "pcc",
      "resume",
      "offerLetter",
      "signature",
    ];

    fileFields.forEach((field) => {
      if (employee[field] && fs.existsSync(employee[field])) {
        fs.unlinkSync(employee[field]);
      }
    });

    // Notify Admins
    await notifyAdmins({
      type: "EMPLOYEE_DELETED",
      message: `Employee Profile Deleted: ${employee.fullName} by ${req.user.fullName}`,
      deletedBy: req.user.id
    });

    // Delete associated user account
    if (employee.userId) {
      await User.findByIdAndDelete(employee.userId);
    }

    // 🔄 SYNC Onboarding Queue: If this employee came from onboarding, reset the invite
    const CandidateInvite = require("../models/CandidateInvite");
    const invite = await CandidateInvite.findOne({ employeeId: req.params.id });
    if (invite) {
      console.log(`🔄 Syncing Onboarding: Resetting invite for ${invite.fullName}`);
      invite.onboardingStatus = "APPROVED"; // Move back to approved so they can be finalized again if needed
      invite.employeeId = null;
      invite.joinedAt = null;
      await invite.save();
    }

    await Employee.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (err) {
    console.error("Error deleting employee:", err);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Get all departments
// @route   GET /api/employees/departments
// @access  Private
exports.getDepartments = async (req, res) => {
  try {
    const departments = await Department.find().select("name _id");

    // If no departments exist, create a default one
    if (departments.length === 0) {
      const defaultDepartment = await Department.create({
        name: "General",
        description: "Default department",
      });
      departments.push(defaultDepartment);
    }

    res.json({
      success: true,
      data: departments,
    });
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching departments",
      error: error.message,
    });
  }
};

// @desc    Create department
// @route   POST /api/employees/departments
// @access  Private (Admin/Manager only)
exports.createDepartment = async (req, res) => {
  try {
    if (req.user.role !== "Admin" && req.user.role !== "Manager") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to create departments",
      });
    }

    const department = await Department.create(req.body);

    res.status(201).json({
      success: true,
      data: department,
    });
  } catch (err) {
    console.error("Error creating department:", err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

// @desc    Get all employee roles
// @route   GET /api/employees/roles
// @access  Private
exports.getRoles = async (req, res) => {
  try {
    let roles = await Role.find().populate("employeeCount");

    // Ensure standard roles exist (upsert missing)
    const requiredRoles = [
      { name: "Employee", description: "Regular employee" },
      { name: "Manager", description: "Department manager" },
      { name: "HR", description: "Human resources" },
      { name: "Sales Person", description: "Sales team member" },
      { name: "Lead Person", description: "Lead generation team member" },
      { name: "Team Leader", description: "Team Leader" },
      { name: "Sales Team Leader", description: "Sales Team Leader" },
      { name: "Senior Sales Executive", description: "Senior Sales Executive" },
    ];

    for (const r of requiredRoles) {
      const exists = roles.some((role) => role.name === r.name);
      if (!exists) {
        await Role.create(r);
      }
    }

    roles = await Role.find().populate("employeeCount");

    res.json({
      success: true,
      data: roles,
    });
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching roles",
      error: error.message,
    });
  }
};

// @desc    Create role
// @route   POST /api/employees/roles
// @access  Private (Admin/Manager only)
exports.createRole = async (req, res) => {
  try {
    if (req.user.role !== "Admin" && req.user.role !== "Manager") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to create roles",
      });
    }

    const role = await Role.create(req.body);

    res.status(201).json({
      success: true,
      data: role,
    });
  } catch (err) {
    console.error("Error creating role:", err.message);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

// @desc    Update role
// @route   PUT /api/employees/roles/:id
// @access  Private (Admin/Manager only)
exports.updateRole = async (req, res) => {
  try {
    if (req.user.role !== "Admin" && req.user.role !== "Manager") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update roles",
      });
    }

    let role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    role = await Role.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: role,
    });
  } catch (err) {
    console.error("Error updating role:", err.message);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

// @desc    Delete role
// @route   DELETE /api/employees/roles/:id
// @access  Private (Admin/Manager only)
exports.deleteRole = async (req, res) => {
  try {
    if (req.user.role !== "Admin" && req.user.role !== "Manager") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete roles",
      });
    }

    const role = await Role.findById(req.params.id).populate("employeeCount");

    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    // Prevent deletion if employees are assigned to this role
    if (role.employeeCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete role with assigned employees",
      });
    }

    await Role.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (err) {
    console.error("Error deleting role:", err.message);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

// @desc    Upload employee documents
// @route   POST /api/employees/:id/documents
// @access  Private
exports.uploadDocuments = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Check authorization: Only IT Manager/Admin/Manager/HR can upload (employees cannot upload even their own)
    // ALLOW employees to upload their own documents now
    if (
      !["HR", "Admin", "Manager", "IT Manager"].includes(req.user.role) &&
      employee.userId?.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Not authorized to upload documents. Please contact your manager or IT Manager.",
      });
    }

    // Handle file uploads
    if (!req.files) {
      return res.status(400).json({
        success: false,
        message: "Please upload files",
      });
    }

    // Initialize documents object if it doesn't exist
    if (!employee.documents) {
      employee.documents = {};
    }

    // Replace whole processing with async for-of
    employee.documents = employee.documents || {};
    for (const docType of Object.keys(req.files)) {
      const file = req.files[docType]?.[0];
      if (!file) continue;
      // delete old
      const oldInfo = employee.documents[docType];
      if (oldInfo) {
        if (typeof oldInfo === "object") {
          await fileStorage.deleteEmployeeDoc(oldInfo);
        } else if (typeof oldInfo === "string" && fs.existsSync(oldInfo)) {
          try {
            fs.unlinkSync(oldInfo);
          } catch {}
        }
      }
      try {
        const uploaded = await fileStorage.uploadEmployeeDoc(file, docType);
        // Store in both documents object and individual field for consistency
        employee.documents[docType] = uploaded;
        employee[docType] = uploaded;
      } catch (e) {
        console.error("Upload doc failed:", e.message);
      }
    }

    await employee.save();

    res.status(200).json({
      success: true,
      data: employee.documents,
    });
  } catch (err) {
    console.error("Error uploading documents:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// @desc    Get employee documents
// @route   GET /api/employees/:id/documents
// @access  Private
exports.getDocuments = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Check authorization: IT Manager/Admin/Manager can view all, employees can only view their own
    if (
      !["HR", "Admin", "Manager", "IT Manager"].includes(req.user.role) &&
      employee.userId?.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view documents",
      });
    }

    // Map individual document fields to documents object if needed
    let documents = employee.documents || {};
    if (!documents || Object.keys(documents).length === 0) {
      documents = {
        photograph: employee.photograph,
        tenthMarksheet: employee.tenthMarksheet,
        twelfthMarksheet: employee.twelfthMarksheet,
        bachelorDegree: employee.bachelorDegree,
        postgraduateDegree: employee.postgraduateDegree,
        aadharCard: employee.aadharCard,
        panCard: employee.panCard,
        pcc: employee.pcc,
        resume: employee.resume,
        offerLetter: employee.offerLetter,
      };
    }

    res.status(200).json({
      success: true,
      data: documents,
    });
  } catch (err) {
    console.error("Error getting documents:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// @desc    Delete employee document
// @route   DELETE /api/employees/:id/documents/:documentType
// @access  Private
exports.deleteDocument = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Check authorization: IT Manager/Admin/Manager can delete, employees cannot delete (even their own)
    // ALLOW employees to delete their own documents now
    if (
      !["HR", "Admin", "Manager", "IT Manager"].includes(req.user.role) &&
      employee.userId?.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete documents",
      });
    }

    const { documentType } = req.params;

    if (!employee.documents || !employee.documents[documentType]) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Delete file from disk
    const filePath = employee.documents[documentType].path;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove document from employee record (both documents object and individual field)
    delete employee.documents[documentType];
    delete employee[documentType];
    await employee.save();

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (err) {
    console.error("Error deleting document:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// @desc    Get employee document
// @route   GET /api/employees/documents/:filename
// @access  Private
exports.getDocument = async (req, res) => {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res
        .status(400)
        .json({ success: false, message: "Filename is required" });
    }

    // Primary local uploads path: server/uploads/employees/<filename>
    const primaryPath = path.join(
      __dirname,
      "..",
      "uploads",
      "employees",
      filename,
    );

    let filePath = null;
    if (fs.existsSync(primaryPath)) {
      filePath = primaryPath;
    }

    if (!filePath) {
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    }

    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === ".pdf"
        ? "application/pdf"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".png"
            ? "image/png"
            : "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", stats.size);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("Error serving document:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Update employee payment details (Bank or UPI)
// @route   POST /api/employees/:id/payment-details
// @access  Private (Admin only)
exports.updatePaymentDetails = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Check authorization - Admin, HR, and Manager can update payment details
    // Employees can also update their own payment details
    // Only Admin can VERIFY with Paytm (creates Beneficiary ID)
    const canManagePayments = ["Admin", "HR", "Manager"].includes(req.user.role);
    const isOwnRecord = employee.userId && employee.userId.toString() === req.user.id;
    if (!canManagePayments && !isOwnRecord) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update payment details. Contact your Admin or HR.",
      });
    }

    const {
      paymentMode,
      bankAccountNumber,
      ifscCode,
      accountHolderName,
      upiId,
    } = req.body;

    // Validate payment mode
    if (paymentMode && !["bank", "upi"].includes(paymentMode)) {
      return res.status(400).json({
        success: false,
        message: 'Payment mode must be either "bank" or "upi"',
      });
    }

    // Validate based on payment mode
    if (paymentMode === "bank") {
      if (!bankAccountNumber || !ifscCode || !accountHolderName) {
        return res.status(400).json({
          success: false,
          message:
            "Bank account number, IFSC code, and account holder name are required for bank payments",
        });
      }

      // Validate IFSC format (4 letters + 0 + 6 digits)
      const ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      if (!ifscPattern.test(ifscCode.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: "Invalid IFSC code format",
        });
      }

      // Clear UPI fields when setting bank details
      employee.upiId = null;
      employee.bankAccountNumber = bankAccountNumber; // Will be encrypted in pre-save hook
      employee.ifscCode = ifscCode.toUpperCase();
      employee.accountHolderName = accountHolderName;
    } else if (paymentMode === "upi") {
      if (!upiId) {
        return res.status(400).json({
          success: false,
          message: "UPI ID is required for UPI payments",
        });
      }

      // Validate UPI format
      const upiPattern = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
      if (!upiPattern.test(upiId.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid UPI ID format. Expected format: user@paytm or user@phonepe",
        });
      }

      // Clear bank fields when setting UPI details
      employee.bankAccountNumber = null;
      employee.ifscCode = null;
      employee.accountHolderName = null;
      employee.upiId = upiId.toLowerCase();
    }

    // Update payment mode
    if (paymentMode) {
      employee.paymentMode = paymentMode;
    }

    // Reset verification status when payment details change
    // Migration Note: paymentVerified replaced with paytmVerified, Razorpay fields removed
    employee.paytmVerified = false;
    employee.paytmBeneficiaryId = null;

    await employee.save();

    // Return employee data (bank account number will be decrypted for authorized users)
    const employeeObj = employee.toObject();

    // Decrypt PII fields for authorized users (Admin, HR, Manager, IT Manager)
    if (["Admin", "HR", "Manager", "IT Manager"].includes(req.user.role)) {
      const decrypted = employee.getDecryptedPII();
      Object.assign(employeeObj, decrypted);
    } else {
      // For non-authorized users, mask it
      if (employeeObj.bankAccountNumber) {
        employeeObj.bankAccountNumber = "***ENCRYPTED***";
      }
      if (employeeObj.upiId) {
        employeeObj.upiId = "***ENCRYPTED***";
      }
    }

    res.status(200).json({
      success: true,
      data: employeeObj,
      message: "Payment details updated successfully",
    });
  } catch (err) {
    console.error("Error updating payment details:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Server Error",
    });
  }
};

// @desc    Verify employee payment details with Paytm
// @route   POST /api/employees/:id/verify-payment
// @access  Private (Admin only)
// Migration Note: This endpoint was migrated from Razorpay to Paytm
exports.verifyPayment = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Check authorization - Admin, HR, and Manager can verify payment details
    if (!["Admin", "HR", "Manager"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to verify payment details",
      });
    }

    // Check if payment mode is set
    if (!employee.paymentMode) {
      return res.status(400).json({
        success: false,
        message:
          "Payment mode must be set before verification. Please update payment details first.",
      });
    }

    // Create or get Paytm Beneficiary (replaces Razorpay Contact + Fund Account)
    let beneficiaryId = employee.paytmBeneficiaryId;

    if (!beneficiaryId) {
      // Paytm creds are only required when we need to create a beneficiary.
      // If a beneficiary already exists, we can just mark verified without calling Paytm.
      if (!process.env.PAYTM_MERCHANT_ID || !process.env.PAYTM_MERCHANT_KEY) {
        return res.status(500).json({
          success: false,
          message:
            "Paytm configuration missing. Please configure PAYTM_MERCHANT_ID and PAYTM_MERCHANT_KEY in environment variables.",
        });
      }

      // Import Paytm service (replaces Razorpay service)
      const paytmService = require("../services/paytmService");

      // Prepare beneficiary data
      const beneficiaryData = {
        name: employee.fullName,
        email: employee.email,
        mobile: employee.phoneNumber || employee.whatsappNumber || "0000000000",
        paymentMode: employee.paymentMode,
      };

      if (employee.paymentMode === "bank") {
        // Validate bank details
        if (
          !employee.bankAccountNumber ||
          !employee.ifscCode ||
          !employee.accountHolderName
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Bank account details are incomplete. Please update payment details first.",
          });
        }

        // Decrypt bank account number for Paytm
        let decryptedAccountNumber;
        try {
          // Check if account number is already encrypted (format: iv:authTag:encryptedData)
          const isEncrypted =
            employee.bankAccountNumber.includes(":") &&
            employee.bankAccountNumber.split(":").length === 3;

          if (isEncrypted) {
            decryptedAccountNumber = decrypt(employee.bankAccountNumber);
            if (!decryptedAccountNumber) {
              throw new Error("Failed to decrypt bank account number");
            }
          } else {
            // Account number is not encrypted yet, use as-is
            // This can happen if payment details were added before encryption was implemented
            decryptedAccountNumber = employee.bankAccountNumber;
            console.warn(
              "Bank account number is not encrypted. Using plain text (not recommended for production).",
            );
          }
        } catch (decryptError) {
          console.error("Decryption error:", decryptError);
          return res.status(400).json({
            success: false,
            message:
              "Error decrypting bank account number. Please update payment details again.",
          });
        }

        beneficiaryData.bankDetails = {
          accountNumber: decryptedAccountNumber,
          ifsc: employee.ifscCode,
          accountHolderName: employee.accountHolderName,
        };
      } else if (employee.paymentMode === "upi") {
        // Validate UPI details
        if (!employee.upiId) {
          return res.status(400).json({
            success: false,
            message: "UPI ID is missing. Please update payment details first.",
          });
        }

        beneficiaryData.upiId = employee.upiId;
      }

      // Create Paytm beneficiary (replaces Razorpay Contact + Fund Account creation)
      try {
        const beneficiary =
          await paytmService.createBeneficiary(beneficiaryData);
        beneficiaryId = beneficiary.beneficiaryId;
        employee.paytmBeneficiaryId = beneficiaryId;
      } catch (beneficiaryError) {
        console.error("Paytm beneficiary creation error:", beneficiaryError);

        // Return detailed error message from Paytm API
        const errorMessage =
          beneficiaryError.message || "Failed to create Paytm beneficiary";

        // Check if it's a configuration error
        if (errorMessage.includes("PAYTM_MERCHANT")) {
          return res.status(500).json({
            success: false,
            message:
              "Paytm configuration missing. Please configure PAYTM_MERCHANT_ID and PAYTM_MERCHANT_KEY in environment variables.",
          });
        }

        // Try to parse Paytm error JSON from error message
        let paytmError = null;
        try {
          // Error message might contain JSON string with Paytm response
          const jsonMatch = errorMessage.match(/\{.*\}/s);
          if (jsonMatch) {
            paytmError = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          // If parsing fails, use the error message as-is
        }

        // Return Paytm API error details
        return res.status(500).json({
          success: false,
          message: errorMessage,
          paytmError: paytmError, // Include parsed Paytm error if available
          error:
            process.env.NODE_ENV === "development"
              ? beneficiaryError.stack
              : undefined,
        });
      }
    }

    // Update employee with Paytm beneficiary ID and mark as verified
    // Migration Note: paymentVerified replaced with paytmVerified
    employee.paytmVerified = true;

    await employee.save();

    // Phase 6: Audit Log (Verification)
    try {
      const PayoutAuditLog = require("../models/PayoutAuditLog");
      await PayoutAuditLog.create({
        employeeId: employee._id,
        action: 'VERIFICATION_SUCCESS',
        status: 'SUCCESS',
        details: { 
          message: 'Payment details verified with Paytm',
          beneficiaryId: employee.paytmBeneficiaryId
        },
        performedBy: req.user.id
      });
    } catch (logError) {
      console.error('Error logging verification:', logError);
    }

    res.status(200).json({
      success: true,
      data: {
        employeeId: employee._id,
        paymentMode: employee.paymentMode,
        paytmVerified: employee.paytmVerified,
        paytmBeneficiaryId: employee.paytmBeneficiaryId,
      },
      message: "Payment details verified successfully with Paytm",
    });
  } catch (err) {
    console.error("Error verifying payment details:", err);
    console.error("Error stack:", err.stack);

    // Provide more detailed error information
    let errorMessage = err.message || "Server Error";

    // Check for specific error types
    if (err.message && err.message.includes("PAYTM_MERCHANT")) {
      errorMessage =
        "Paytm configuration missing. Please configure PAYTM_MERCHANT_ID and PAYTM_MERCHANT_KEY in environment variables.";
    } else if (err.message && err.message.includes("decrypt")) {
      errorMessage =
        "Error decrypting bank account number. Please check encryption configuration.";
    }

    // Return error with Paytm API details if available
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

// @desc    Get employment history for an employee
// @route   GET /api/employees/:id/employment-history
// @access  Private
exports.getEmploymentHistory = async (req, res) => {
  try {
    const history = await EmploymentHistory.find({ employeeId: req.params.id })
      .populate("changedBy", "fullName email role")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (err) {
    console.error("Error fetching employment history:", err);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Get employee timeline events
// @route   GET /api/employees/:id/timeline
// @access  Private
exports.getEmployeeTimeline = async (req, res) => {
  try {
    const timeline = await EmployeeTimeline.find({ employeeId: req.params.id })
      .populate("performedBy", "fullName email role")
      .sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      count: timeline.length,
      data: timeline,
    });
  } catch (err) {
    console.error("Error fetching employee timeline:", err);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Get employee audit logs
// @route   GET /api/employees/:id/audit-logs
// @access  Private (Admin/HR/Manager)
exports.getEmployeeAuditLogs = async (req, res) => {
  try {
    const logs = await Log.find({
      affectedResource: "Employee",
      resourceId: req.params.id,
    })
      .populate("performedBy", "fullName email role")
      .sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (err) {
    console.error("Error fetching employee audit logs:", err);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Get full Employee 360 aggregated workspace data
// @route   GET /api/employees/:id/360
// @access  Private (Admin/HR: any employee, Manager: direct reports only, Employee: own only)
exports.get360Profile = async (req, res) => {
  try {
    const employeeId = req.params.id;

    // 1. Fetch the employee record first to authorize the request
    const employee = await Employee.findById(employeeId)
      .populate("department", "name description")
      .populate("role", "name description")
      .populate("reportingManager", "fullName email role profilePicture")
      .populate("hrId", "fullName email");

    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    const requestingRole = req.user.role;
    const isAdminOrHR = ["Admin", "HR"].includes(requestingRole);
    const isOwnProfile = employee.userId?.toString() === req.user.id;
    const isDirectManager =
      requestingRole === "Manager" &&
      employee.reportingManager?._id?.toString() === req.user.id;

    // Authorization gate
    if (!isAdminOrHR && !isOwnProfile && !isDirectManager) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only view your own profile or direct reports.",
      });
    }

    // 2. Build employee object and decrypt PII for authorized viewers
    const empObj = employee.toObject();
    if (isAdminOrHR || isOwnProfile) {
      try {
        const decrypted = employee.getDecryptedPII();
        Object.assign(empObj, decrypted);
      } catch (e) {
        console.error("PII decryption error:", e);
      }
    }

    // 3. Parallel aggregation — all collections fetched in one round-trip
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      employmentHistory,
      timeline,
      attendance,
      reviews,
      promotions,
      salaryHistory,
      latestPerf,
      assignedAssets,
      assetAssignments,
      exitRequests,
    ] = await Promise.all([
      EmploymentHistory.find({ employeeId })
        .populate("changedBy", "fullName email role")
        .sort({ createdAt: -1 })
        .lean(),
      EmployeeTimeline.find({ employeeId })
        .populate("performedBy", "fullName email role")
        .sort({ timestamp: -1 })
        .limit(60)
        .lean(),
      Attendance.find({ employeeId, date: { $gte: thirtyDaysAgo } })
        .sort({ date: -1 })
        .lean(),
      PerformanceReview.find({ employeeId })
        .populate("reviewCycleId", "name cycleType startDate endDate")
        .sort({ createdAt: -1 })
        .lean(),
      PromotionRequest.find({ employeeId })
        .populate("proposedRole", "name")
        .populate("proposedDepartment", "name")
        .populate("currentRole", "name")
        .populate("currentDepartment", "name")
        .sort({ createdAt: -1 })
        .lean(),
      // Salary history: only for Admin/HR or own profile (not manager)
      (isAdminOrHR || isOwnProfile)
        ? SalaryHistory.find({ employeeId })
            .populate("approvedBy", "fullName email")
            .sort({ effectiveDate: -1 })
            .lean()
        : Promise.resolve([]),
      MonthlyPerformanceRecord.findOne({ employeeId })
        .sort({ createdAt: -1 })
        .lean(),
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
      ExitRequest.find({ employeeId })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    // 4. Compute attendance summary
    const totalDays = attendance.length;
    const presentDays = attendance.filter((a) => a.status === "PRESENT").length;
    const absentDays = attendance.filter((a) => a.status === "ABSENT").length;
    const lateDays = attendance.filter((a) => a.status === "LATE").length;
    const halfDays = attendance.filter((a) => a.status === "HALF_DAY").length;
    const leaveDays = attendance.filter((a) => a.status === "ON_LEAVE").length;
    const attendancePercentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

    // 5. Compute health indicators
    const lastReview = reviews.find((r) => r.status === "FINALIZED") || reviews[0] || null;
    const lastPromotion = promotions.find((p) => p.status === "APPROVED") || null;
    const lastIncrement = salaryHistory[0] || null;

    // Attendance trend: compare first half vs second half of last 30 days
    const mid = Math.floor(attendance.length / 2);
    const firstHalf = attendance.slice(mid);
    const secondHalf = attendance.slice(0, mid);
    const firstPresent = firstHalf.filter((a) => a.status === "PRESENT").length;
    const secondPresent = secondHalf.filter((a) => a.status === "PRESENT").length;
    let attendanceTrend = "STABLE";
    if (secondPresent > firstPresent + 1) attendanceTrend = "UP";
    else if (firstPresent > secondPresent + 1) attendanceTrend = "DOWN";

    // Performance trend
    const finalizedReviews = reviews.filter((r) => r.status === "FINALIZED");
    let performanceTrend = "STABLE";
    if (finalizedReviews.length >= 2) {
      const latest = finalizedReviews[0]?.finalRecommendation?.finalRating || 0;
      const prev = finalizedReviews[1]?.finalRecommendation?.finalRating || 0;
      if (latest > prev) performanceTrend = "UP";
      else if (latest < prev) performanceTrend = "DOWN";
    }

    // 6. Documents (normalized to standard shape)
    const documents = {
      photograph: empObj.photograph || null,
      tenthMarksheet: empObj.tenthMarksheet || null,
      twelfthMarksheet: empObj.twelfthMarksheet || null,
      bachelorDegree: empObj.bachelorDegree || null,
      postgraduateDegree: empObj.postgraduateDegree || null,
      aadharCard: (isAdminOrHR || isOwnProfile) ? (empObj.aadharCard || null) : null,
      panCard: (isAdminOrHR || isOwnProfile) ? (empObj.panCard || null) : null,
      pcc: empObj.pcc || null,
      resume: empObj.resume || null,
      offerLetter: empObj.offerLetter || null,
      signature: empObj.signature || null,
    };

    // 7. Build unified response
    res.status(200).json({
      success: true,
      data: {
        employee: empObj,
        employmentHistory,
        timeline,
        attendance: {
          summary: {
            totalDays,
            presentDays,
            absentDays,
            lateDays,
            halfDays,
            leaveDays,
            attendancePercentage,
          },
          records: attendance,
        },
        performance: {
          latestMonthly: latestPerf || null,
        },
        reviews,
        promotions,
        compensation: {
          currentSalary: (isAdminOrHR || isOwnProfile) ? (empObj.salary || 0) : null,
          history: salaryHistory,
        },
        documents,
        assets: {
          currentAssets: assignedAssets || [],
          assignmentHistory: assetAssignments || [],
        },
        exits: exitRequests || [],
        healthIndicators: {
          attendanceTrend,
          attendancePercentage,
          performanceTrend,
          reviewCompletion: !!lastReview,
          lastReviewDate: lastReview?.finalRecommendation?.finalizedAt || null,
          lastReviewRating: lastReview?.finalRecommendation?.ratingCategory || null,
          lastIncrementDate: lastIncrement?.effectiveDate || null,
          lastIncrementPercentage: lastIncrement?.incrementPercentage || null,
          promotionCount: promotions.filter((p) => p.status === "APPROVED").length,
          assignedAssetCount: (assignedAssets || []).length,
          isPIPActive: employee.status === "PIP",
        },
      },
    });
  } catch (err) {
    console.error("Error fetching Employee 360 profile:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
