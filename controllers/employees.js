const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Role = require('../models/EmployeeRole');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const fileStorage = require('../services/fileStorageService');

// Export multer upload middleware
exports.uploadEmployeeFiles = fileStorage.uploadMiddleware.fields([
  { name: 'photograph', maxCount: 1 },
  { name: 'tenthMarksheet', maxCount: 1 },
  { name: 'twelfthMarksheet', maxCount: 1 },
  { name: 'bachelorDegree', maxCount: 1 },
  { name: 'postgraduateDegree', maxCount: 1 },
  { name: 'aadharCard', maxCount: 1 },
  { name: 'panCard', maxCount: 1 },
  { name: 'pcc', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
  { name: 'offerLetter', maxCount: 1 }
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
    const removeFields = ['select', 'sort', 'page', 'limit'];

    // Loop over removeFields and delete them from reqQuery
    removeFields.forEach(param => delete reqQuery[param]);

    // Create query string
    let queryStr = JSON.stringify(reqQuery);

    // Create operators ($gt, $gte, etc)
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);

    // Role-based filtering
    if (req.user.role === 'HR') {
      // HR can see employees they manage or all if no hrId restriction
      query = Employee.find(JSON.parse(queryStr));
    } else if (req.user.role === 'Admin' || req.user.role === 'Manager') {
      // Admin and Manager can see all employees
      query = Employee.find(JSON.parse(queryStr));
    } else {
      // Other users can see all employees (for profile viewing)
      query = Employee.find(JSON.parse(queryStr));
    }

    // Populate role and department for all queries
    query = query.populate('role', 'name description')
                 .populate('department', 'name description');

    // Select Fields
    if (req.query.select) {
      const fields = req.query.select.split(',').join(' ');
      query = query.select(fields);
    }

    // Sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
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
      if (emp.role && typeof emp.role === 'object' && emp.role.name) {
        if (emp.role.name === 'IT Intern' && emp.employmentType !== 'INTERN') {
          employeesToFix.push({ id: emp._id, type: 'INTERN' });
          emp.employmentType = 'INTERN'; // Update in memory immediately
        } else if (emp.role.name === 'IT Permanent' && emp.employmentType !== 'PERMANENT') {
          employeesToFix.push({ id: emp._id, type: 'PERMANENT' });
          emp.employmentType = 'PERMANENT'; // Update in memory immediately
        }
      }
    }
    
    // Batch update in database (more efficient)
    if (employeesToFix.length > 0) {
      console.log(`Auto-fixing employmentType for ${employeesToFix.length} employees`);
      const updatePromises = employeesToFix.map(({ id, type }) => 
        Employee.findByIdAndUpdate(id, { employmentType: type }, { new: false })
      );
      await Promise.all(updatePromises);
    }

    // Transform employees: map individual document fields to documents object
    const transformedEmployees = employees.map(emp => {
      const empObj = emp.toObject();
      // If documents object is empty but individual fields exist, map them
      if ((!empObj.documents || Object.keys(empObj.documents).length === 0) && 
          (empObj.photograph || empObj.aadharCard || empObj.panCard || empObj.resume)) {
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
          offerLetter: empObj.offerLetter
        };
      }
      return empObj;
    });

    // Pagination result
    const pagination = {};

    if (endIndex < total) {
      pagination.next = {
        page: page + 1,
        limit
      };
    }

    if (startIndex > 0) {
      pagination.prev = {
        page: page - 1,
        limit
      };
    }

    res.status(200).json({
      success: true,
      count: transformedEmployees.length,
      pagination,
      data: transformedEmployees
    });
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single employee
// @route   GET /api/employees/:id
// @access  Private
exports.getEmployee = async (req, res) => {
  try {
    console.log('Fetching employee with ID:', req.params.id);
    
    const employee = await Employee.findById(req.params.id)
      .populate('department', 'name description')
      .populate('role', 'name description')
      .populate('hrId', 'fullName email');

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    console.log('Found employee data:', {
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
        offerLetter: !!employee.offerLetter
      }
    });

    // Check authorization - Allow HR, Admin, Manager, IT Manager, and users viewing their own profile
    if (req.user.role === 'HR' || req.user.role === 'Admin' || req.user.role === 'Manager' || 
        req.user.role === 'IT Manager' || employee.userId?.toString() === req.user.id) {
      // Authorized
    } else {
      // Allow all users to view employee data for profile purposes
      // This enables the profile page to show employee information
    }

    // Transform: map individual document fields to documents object
    const empObj = employee.toObject();
    if ((!empObj.documents || Object.keys(empObj.documents).length === 0) && 
        (empObj.photograph || empObj.aadharCard || empObj.panCard || empObj.resume)) {
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
        offerLetter: empObj.offerLetter
      };
    }

    res.status(200).json({
      success: true,
      data: empObj
    });
  } catch (err) {
    console.error('Error fetching employee:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get employee by user ID
// @route   GET /api/employees/user/:userId
// @access  Private
exports.getEmployeeByUserId = async (req, res) => {
  try {
    console.log('Fetching employee by user ID:', req.params.userId);
    
    const employee = await Employee.findOne({ userId: req.params.userId })
      .populate('department', 'name description')
      .populate('role', 'name description')
      .populate('hrId', 'fullName email');

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found for this user'
      });
    }

    console.log('Found employee by userId:', {
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
        offerLetter: !!employee.offerLetter
      }
    });

    // Check authorization - Allow HR, Admin, Manager, IT Manager, and users viewing their own profile
    if (req.user.role === 'HR' || req.user.role === 'Admin' || req.user.role === 'Manager' || 
        req.user.role === 'IT Manager' || employee.userId?.toString() === req.user.id) {
      // Authorized
    } else {
      // Allow all users to view employee data for profile purposes
    }

    // Transform: map individual document fields to documents object
    const empObj = employee.toObject();
    if ((!empObj.documents || Object.keys(empObj.documents).length === 0) && 
        (empObj.photograph || empObj.aadharCard || empObj.panCard || empObj.resume)) {
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
        offerLetter: empObj.offerLetter
      };
    }

    res.status(200).json({
      success: true,
      data: empObj
    });
  } catch (err) {
    console.error('Error fetching employee by userId:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new employee
// @route   POST /api/employees
// @access  Private
exports.createEmployee = async (req, res) => {
  try {
    console.log('Create employee request received:', {
      body: req.body,
      files: req.files ? Object.keys(req.files) : 'No files',
      contentType: req.headers['content-type']
    });
    
    // Parse employee data from form
    const employeeData = typeof req.body.employee === 'string' ? JSON.parse(req.body.employee) : req.body;
    
    // Check if user is trying to create their own profile
    const isCreatingOwnProfile = employeeData.userId === req.user.id || 
                                !employeeData.userId || 
                                employeeData.email === req.user.email;
    
    // Allow users to create their own profiles, but restrict admin functions
    if (!isCreatingOwnProfile && !['HR', 'Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create employee profiles for other users'
      });
    }
    
    // Set the user ID for the employee
    if (isCreatingOwnProfile) {
      employeeData.userId = req.user.id;
      employeeData.fullName = employeeData.fullName || req.user.fullName;
      employeeData.email = employeeData.email || req.user.email;
    }
    
    // Add HR ID if user is HR
    if (req.user.role === 'HR') {
      employeeData.hrId = req.user.id;
    }

    // Handle file uploads
    if (req.files) {
      console.log('Processing file uploads:', Object.keys(req.files));
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
            path: file.path
          });
          try {
            const uploaded = await fileStorage.uploadEmployeeDoc(file, fieldName);
            console.log(`File ${fieldName} uploaded successfully:`, uploaded);
            // Store in both individual field and documents object for consistency
            employeeData[fieldName] = uploaded;
            employeeData.documents[fieldName] = uploaded;
          } catch (e) {
            console.error(`Upload failed for ${fieldName}:`, e.message);
          }
        }
      }
    } else {
      console.log('No files found in request');
    }

    // Create employee
    const employee = await Employee.create(employeeData);

    // Create user account if username and password provided (admin function only)
    if (req.body.username && req.body.password && ['HR', 'Admin', 'Manager'].includes(req.user.role)) {
      const userData = {
        fullName: employeeData.fullName,
        email: employeeData.email,
        password: req.body.password,
        role: 'Employee',
        employeeId: employee._id
      };

      const user = await User.create(userData);
      employee.userId = user._id;
      await employee.save();
    }

    res.status(201).json({
      success: true,
      data: employee
    });
  } catch (err) {
    console.error('Error creating employee:', err);
    console.log('Employee data being processed:', employeeData);
    res.status(400).json({
      success: false,
      message: err.message,
      error: err,
      data: employeeData
    });
  }
};

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private
exports.updateEmployee = async (req, res) => {
  try {
    let employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Check authorization - Allow only HR, Admin, and Manager to update employees
    if (!['HR', 'Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update employee profiles'
      });
    }

    // Parse employee data from form
    const employeeData = req.body.employee ? JSON.parse(req.body.employee) : req.body;

    // If role is being updated, ensure employmentType is correct
    if (employeeData.role) {
      const EmployeeRole = require('../models/EmployeeRole');
      const role = await EmployeeRole.findById(employeeData.role);
      if (role && role.name === 'IT Intern') {
        employeeData.employmentType = 'INTERN';
      } else if (role && role.name === 'IT Permanent') {
        employeeData.employmentType = 'PERMANENT';
      }
    }

    // Handle file uploads
    if (req.files) {
      for (const fieldName of Object.keys(req.files)) {
        const arr = req.files[fieldName];
        if (arr && arr[0]) {
          // delete old
          const oldInfo = employee[fieldName];
          if (oldInfo) {
            if (typeof oldInfo === 'object') {
              await fileStorage.deleteEmployeeDoc(oldInfo);
            } else if (typeof oldInfo === 'string' && fs.existsSync(oldInfo)) {
              fs.unlinkSync(oldInfo);
            }
          }
          const file = arr[0];
          try {
            const uploaded = await fileStorage.uploadEmployeeDoc(file, fieldName);
            employeeData[fieldName] = uploaded;
          } catch (e) {
            console.error(`Upload failed for ${fieldName}:`, e.message);
          }
        }
      }
    }

    employee = await Employee.findByIdAndUpdate(req.params.id, employeeData, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: employee
    });
  } catch (err) {
    console.error('Error updating employee:', err);
    res.status(400).json({
      success: false,
      message: err.message
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
        message: 'Employee not found'
      });
    }

    // Check authorization - Allow HR, Admin, and Manager to delete employees
    if (!['HR', 'Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete employees'
      });
    }

    // Delete associated files
    const fileFields = ['photograph', 'tenthMarksheet', 'twelfthMarksheet', 'bachelorDegree', 
                       'postgraduateDegree', 'aadharCard', 'panCard', 'pcc', 'resume', 'offerLetter'];
    
    fileFields.forEach(field => {
      if (employee[field] && fs.existsSync(employee[field])) {
        fs.unlinkSync(employee[field]);
      }
    });

    // Delete associated user account
    if (employee.userId) {
      await User.findByIdAndDelete(employee.userId);
    }

    await Employee.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    console.error('Error deleting employee:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get all departments
// @route   GET /api/employees/departments
// @access  Private
exports.getDepartments = async (req, res) => {
  try {
    const departments = await Department.find().select('name _id');
    
    // If no departments exist, create a default one
    if (departments.length === 0) {
      const defaultDepartment = await Department.create({
        name: 'General',
        description: 'Default department'
      });
      departments.push(defaultDepartment);
    }

    res.json({
      success: true,
      data: departments
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching departments',
      error: error.message
    });
  }
};

// @desc    Create department
// @route   POST /api/employees/departments
// @access  Private (Admin/Manager only)
exports.createDepartment = async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create departments'
      });
    }

    const department = await Department.create(req.body);

    res.status(201).json({
      success: true,
      data: department
    });
  } catch (err) {
    console.error('Error creating department:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Get all employee roles
// @route   GET /api/employees/roles
// @access  Private
exports.getRoles = async (req, res) => {
  try {
    const roles = await Role.find().select('name _id');

    // If no roles exist, create default ones
    if (roles.length === 0) {
      const defaultRoles = await Role.insertMany([
        { name: 'Employee', description: 'Regular employee' },
        { name: 'Manager', description: 'Department manager' },
        { name: 'HR', description: 'Human resources' },
        { name: 'Sales Person', description: 'Sales team member' },
        { name: 'Lead Person', description: 'Lead generation team member' }
      ]);
      roles.push(...defaultRoles);
    }

    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching roles',
      error: error.message
    });
  }
};

// @desc    Create role
// @route   POST /api/employees/roles
// @access  Private (Admin/Manager only)
exports.createRole = async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create roles'
      });
    }

    const role = await Role.create(req.body);

    res.status(201).json({
      success: true,
      data: role
    });
  } catch (err) {
    console.error('Error creating role:', err);
    res.status(400).json({
      success: false,
      message: err.message
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
        message: 'Employee not found'
      });
    }

    // Check authorization: Only IT Manager/Admin/Manager/HR can upload (employees cannot upload even their own)
    if (!['HR', 'Admin', 'Manager', 'IT Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload documents. Please contact your manager or IT Manager.'
      });
    }

    // Handle file uploads
    if (!req.files) {
      return res.status(400).json({
        success: false,
        message: 'Please upload files'
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
        if (typeof oldInfo === 'object') {
          await fileStorage.deleteEmployeeDoc(oldInfo);
        } else if (typeof oldInfo === 'string' && fs.existsSync(oldInfo)) {
          try { fs.unlinkSync(oldInfo); } catch {}
        }
      }
      try {
        const uploaded = await fileStorage.uploadEmployeeDoc(file, docType);
        // Store in both documents object and individual field for consistency
        employee.documents[docType] = uploaded;
        employee[docType] = uploaded;
      } catch (e) {
        console.error('Upload doc failed:', e.message);
      }
    }

    await employee.save();

    res.status(200).json({
      success: true,
      data: employee.documents
    });
  } catch (err) {
    console.error('Error uploading documents:', err);
    res.status(500).json({
      success: false,
      message: err.message
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
        message: 'Employee not found'
      });
    }

    // Check authorization: IT Manager/Admin/Manager can view all, employees can only view their own
    if (!['HR', 'Admin', 'Manager', 'IT Manager'].includes(req.user.role) && 
        employee.userId?.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view documents'
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
        offerLetter: employee.offerLetter
      };
    }

    res.status(200).json({
      success: true,
      data: documents
    });
  } catch (err) {
    console.error('Error getting documents:', err);
    res.status(500).json({
      success: false,
      message: err.message
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
        message: 'Employee not found'
      });
    }

    // Check authorization: IT Manager/Admin/Manager can delete, employees cannot delete (even their own)
    if (!['HR', 'Admin', 'Manager', 'IT Manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete documents'
      });
    }

    const { documentType } = req.params;

    if (!employee.documents || !employee.documents[documentType]) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
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
      data: {}
    });
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({
      success: false,
      message: err.message
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
      return res.status(400).json({ success: false, message: 'Filename is required' });
    }

    // Primary local uploads path: server/uploads/employees/<filename>
    const primaryPath = path.join(__dirname, '..', 'uploads', 'employees', filename);

    let filePath = null;
    if (fs.existsSync(primaryPath)) {
      filePath = primaryPath;
    }

    if (!filePath) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf'
      : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
      : ext === '.png' ? 'image/png'
      : 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('Error serving document:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};