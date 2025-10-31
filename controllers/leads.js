const Lead = require('../models/Lead');

// @desc    Get all leads
// @route   GET /api/leads
// @access  Private
exports.getLeads = async (req, res) => {
  try {
    console.log('============= GET LEADS REQUEST =============');
    console.log('User making request:', {
      id: req.user._id,
      idString: req.user._id.toString(),
      role: req.user.role,
      name: req.user.fullName,
      email: req.user.email
    });
    console.log('Query parameters:', req.query);
    
    // Extract date filtering parameters from query
    const { month, year, startDate, endDate } = req.query;
    
    // Instead of using complex filtering, let's use direct MongoDB queries
    let query;
    
    // Different queries based on role
    if (req.user.role === 'Admin' || req.user.role === 'Manager') {
      // Admin and Manager see all leads
      console.log('Admin/Manager role - fetching ALL leads');
      query = Lead.find({});
    } 
    else if (req.user.role === 'Lead Person') {
      // Lead Person sees leads they created or leads assigned to them
      console.log('Lead Person role - fetching created or assigned leads');
      const userId = req.user._id;
      
      // Query with direct ID comparison
      query = Lead.find({
        $or: [
          { leadPerson: userId },
          { assignedTo: userId }
        ]
      });
    }
    else {
      // Sales Person sees only leads assigned to them
      console.log('Sales Person role - fetching assigned leads');
      const userId = req.user._id;
      
      // Query for assignedTo exact match
      query = Lead.find({ assignedTo: userId });
    }
    
    // Add date filtering if provided
    if (month && year) {
      console.log(`Filtering by month: ${month}, year: ${year}`);
      const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endOfMonth = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
      
      query = query.where('createdAt').gte(startOfMonth).lte(endOfMonth);
      console.log(`Date range: ${startOfMonth.toISOString()} to ${endOfMonth.toISOString()}`);
    } else if (startDate && endDate) {
      console.log(`Filtering by date range: ${startDate} to ${endDate}`);
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include the entire end date
      
      query = query.where('createdAt').gte(start).lte(end);
      console.log(`Date range: ${start.toISOString()} to ${end.toISOString()}`);
    } else if (startDate) {
      console.log(`Filtering from date: ${startDate}`);
      const start = new Date(startDate);
      query = query.where('createdAt').gte(start);
    } else if (endDate) {
      console.log(`Filtering until date: ${endDate}`);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query = query.where('createdAt').lte(end);
    }
    
    // Sort by created date, newest first
    query = query.sort({ createdAt: -1 });
    
    // Populate relevant fields
    query = query.populate('assignedTo', 'fullName email role')
                .populate('leadPerson', 'fullName email role');
    
    // Execute the query
    const leads = await query;
    
    console.log(`Found ${leads.length} leads for this user`);
    
    // Log lead details for debugging (limit to first 5 for readability)
    if (leads.length > 0) {
      console.log('Lead details (first 5):');
      leads.slice(0, 5).forEach(lead => {
        console.log(`- Lead ID: ${lead._id}, Name: ${lead.name}, Date: ${lead.createdAt}`);
        console.log(`  Assigned to: ${lead.assignedTo ? lead.assignedTo.fullName + ' (ID: ' + lead.assignedTo._id + ')' : 'None'}`);
      });
      
      if (leads.length > 5) {
        console.log(`... and ${leads.length - 5} more leads`);
      }
    } else {
      console.log('No leads found for this user with the given filters');
    }
    
    console.log('==============================================');
    
    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads,
      filters: {
        month: month || null,
        year: year || null,
        startDate: startDate || null,
        endDate: endDate || null
      }
    });
  } catch (err) {
    console.error('Error in getLeads:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Get single lead
// @route   GET /api/leads/:id
// @access  Private
exports.getLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedTo', 'fullName email')
      .populate('leadPerson', 'fullName email');
    
    console.log('Lead found:', lead ? lead._id : 'None');
    
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: `No lead found with id of ${req.params.id}`
      });
    }
    
    // Show detailed info for debugging
    console.log('Lead details:');
    console.log(`  - ID: ${lead._id}`);
    console.log(`  - Name: ${lead.name}`); 
    console.log(`  - AssignedTo ID: ${lead.assignedTo ? lead.assignedTo._id : 'None'}`);
    console.log(`  - AssignedTo Name: ${lead.assignedTo ? lead.assignedTo.fullName : 'None'}`);
    console.log(`  - Current User ID: ${req.user._id}`);
    
    const leadAssignedId = lead.assignedTo ? lead.assignedTo._id.toString() : null;
    const userId = req.user._id.toString();
    console.log(`  - String comparison: ${leadAssignedId === userId}`);
    
    // Check if user is authorized to view this lead
    if (
      req.user.role !== 'Admin' && 
      req.user.role !== 'Manager' && 
      lead.assignedTo.toString() !== req.user._id.toString() &&
      !(req.user.role === 'Lead Person' && 
        lead.leadPerson && 
        lead.leadPerson._id.toString() === req.user._id.toString())
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this lead'
      });
    }
    
    res.status(200).json({
      success: true,
      data: lead
    });
  } catch (err) {
    console.error('Error in getLead:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Create new lead
// @route   POST /api/leads
// @access  Private
exports.createLead = async (req, res) => {
  try {
    console.log('============= CREATE LEAD REQUEST =============');
    console.log('Lead data submitted:', req.body);
    console.log('User creating lead:', {
      id: req.user._id,
      role: req.user.role,
      name: req.user.fullName
    });
    
    // Validate required fields before processing
    const requiredFields = ['NAME', 'COURSE', 'CODE', 'NUMBER', 'COUNTRY', 'SALE PERSON'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      console.error('Missing required fields:', missingFields);
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields: missingFields
      });
    }
    
    // Map the new field names to the database model field names
    const leadData = {
      name: req.body.NAME,
      email: req.body['E-MAIL'] || '',
      course: req.body.COURSE,
      countryCode: req.body.CODE,
      phone: req.body.NUMBER,
      country: req.body.COUNTRY,
      pseudoId: req.body['PSUDO ID'],
      client: req.body['CLIENT REMARK'],
      status: req.body.status || 'Introduction',
      source: req.body.SOURSE,
      sourceLink: req.body['SOURCE LINK'],
      assignedTo: req.body['SALE PERSON'],
      leadPerson: req.body['LEAD PERSON'],
      feedback: req.body.FEEDBACK,
      createdAt: req.body.DATE ? new Date(req.body.DATE) : Date.now(),
      isRepeatCustomer: false, // Default value, will be updated if needed
      previousCourses: [],
      relatedLeads: []
    };
    
    // Set createdBy to the current user
    leadData.createdBy = req.user._id;
    
    // If the user is a Lead Person, set them as the leadPerson
    if (req.user.role === 'Lead Person') {
      leadData.leadPerson = req.user._id;
      console.log('Setting leadPerson to current user', req.user._id);
    }
    
    // Critical: Make sure assignedTo is properly set
    if (!leadData.assignedTo || leadData.assignedTo === '') {
      console.log('No assignedTo provided, using current user', req.user._id);
      leadData.assignedTo = req.user._id;
    } else {
      console.log('Using provided assignedTo:', leadData.assignedTo);
      // ObjectId is handled properly by Mongoose, no need to convert
    }
    
    // Check if this is a repeat customer by phone number or email
    let previousLeads = [];
    let isRepeatCustomer = false;
    
    // Only check if either phone or email is provided
    if (leadData.phone || (leadData.email && leadData.email.trim() !== '')) {
      // Build the query to find potential matches
      const matchQuery = { $or: [] };
      
      // Add phone number condition if provided
      if (leadData.phone) {
        matchQuery.$or.push({ phone: leadData.phone });
      }
      
      // Add email condition if provided and not empty
      if (leadData.email && leadData.email.trim() !== '') {
        matchQuery.$or.push({ email: leadData.email });
      }
      
      // Only run the query if we have conditions
      if (matchQuery.$or.length > 0) {
        console.log('Checking for repeat customer with query:', matchQuery);
        previousLeads = await Lead.find(matchQuery).select('_id name course createdAt');
        
        // If we found previous leads with the same email or phone
        if (previousLeads.length > 0) {
          isRepeatCustomer = true;
          
          // Extract previous courses from the found leads
          const previousCourses = previousLeads
            .map(lead => lead.course)
            .filter(course => course !== leadData.course); // Exclude current course
          
          // Extract the IDs of related leads
          const relatedLeadIds = previousLeads.map(lead => lead._id);
          
          // Update the lead data
          leadData.isRepeatCustomer = true;
          leadData.previousCourses = [...new Set(previousCourses)]; // Remove duplicates
          leadData.relatedLeads = relatedLeadIds;
          
          console.log(`This is a repeat customer! Found ${previousLeads.length} previous leads`);
          console.log('Previous courses:', leadData.previousCourses);
        }
      }
    }
    
    // Make sure creation timestamp is set
    leadData.updatedAt = Date.now();
    
    console.log('Final lead data before creation:', leadData);
    
    const lead = await Lead.create(leadData);
    
    // Verify the created lead
    const createdLead = await Lead.findById(lead._id).populate('assignedTo').populate('createdBy');
    console.log('Created lead successfully:', {
      id: createdLead._id,
      name: createdLead.name,
      assignedTo: createdLead.assignedTo ? {
        id: createdLead.assignedTo._id,
        name: createdLead.assignedTo.fullName
      } : 'None',
      createdBy: createdLead.createdBy ? {
        id: createdLead.createdBy._id,
        name: createdLead.createdBy.fullName
      } : 'None'
    });
    console.log('==============================================');
    
    res.status(201).json({
      success: true,
      data: lead
    });
  } catch (err) {
    console.error('Error creating lead:', err);
    
    // Handle duplicate key errors (commonly for email)
    if (err.code === 11000 && err.keyPattern) {
      // Get the field name causing the duplicate
      const field = Object.keys(err.keyPattern)[0];
      const value = err.keyValue[field];
      
      console.error(`Duplicate key error for field: ${field}, value: ${value}`);
      
      // Instead of returning an error, we'll allow duplicates for repeat customers
      console.log('Allowing duplicate value for repeat customer');
      
      // Try creating the lead again without the unique constraint
      try {
        // Modify the data to work around the duplicate key issue
        if (field === 'email') {
          // For email duplicates, proceed with creating the lead
          // The email validation in the model already allows duplicates
          const leadData = {
            name: req.body.NAME,
            email: '',  // Set empty email to avoid duplicate
            course: req.body.COURSE,
            countryCode: req.body.CODE,
            phone: req.body.NUMBER,
            country: req.body.COUNTRY,
            pseudoId: req.body['PSUDO ID'],
            client: req.body['CLIENT REMARK'],
            status: req.body.status || 'Introduction',
            source: req.body.SOURSE,
            sourceLink: req.body['SOURCE LINK'],
            assignedTo: req.body['SALE PERSON'],
            leadPerson: req.body['LEAD PERSON'],
            feedback: req.body.FEEDBACK,
            createdAt: req.body.DATE ? new Date(req.body.DATE) : Date.now(),
            isRepeatCustomer: true,
            previousCourses: [],
            relatedLeads: [],
            createdBy: req.user._id,
            updatedAt: Date.now()
          };
        
          // Create the lead with the modified data
          const lead = await Lead.create(leadData);
          
          return res.status(201).json({
            success: true,
            data: lead
          });
        }
      } catch (retryErr) {
        console.error('Error on retry after duplicate key:', retryErr);
        return res.status(400).json({
          success: false,
          message: 'Failed to create lead even after handling duplicate key'
        });
      }
    }
    
    // Provide more detailed error messages for common validation errors
    if (err.name === 'ValidationError') {
      const validationErrors = Object.keys(err.errors).map(field => ({
        field: field,
        message: err.errors[field].message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed: ' + validationErrors.map(e => e.message).join(', '),
        errors: validationErrors
      });
    }
    
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Update lead
// @route   PUT /api/leads/:id
// @access  Private
exports.updateLead = async (req, res) => {
  try {
    console.log('============= UPDATE LEAD REQUEST =============');
    console.log('User updating lead:', {
      id: req.user._id,
      role: req.user.role,
      name: req.user.fullName
    });
    console.log('Update data:', req.body);
    
    let lead = await Lead.findById(req.params.id);
    
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: `No lead found with id of ${req.params.id}`
      });
    }
    
    console.log('Found lead:', {
      id: lead._id,
      name: lead.name,
      assignedTo: lead.assignedTo
    });
    
    // Check if user is authorized to update this lead
    if (
      req.user.role !== 'Admin' && 
      req.user.role !== 'Manager' && 
      req.user.role !== 'Lead Person' &&
      lead.assignedTo.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this lead'
      });
    }
    
    // For Sales Persons, only allow updating the status field
    if (req.user.role === 'Sales Person') {
      console.log('Sales Person is updating lead status to:', req.body.status);
      
      // Only update the status and updatedAt fields
      const updateData = {
        status: req.body.status,
        updatedAt: Date.now()
      };
      
      lead = await Lead.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true
      });
      
      return res.status(200).json({
        success: true,
        data: lead
      });
    }
    
    // For Lead Person, Manager and Admin, allow full updates
    // Map the new field names to the database model field names
    const updatedData = {
      name: req.body.NAME,
      email: req.body['E-MAIL'] || '',
      course: req.body.COURSE,
      countryCode: req.body.CODE,
      phone: req.body.NUMBER,
      country: req.body.COUNTRY,
      pseudoId: req.body['PSUDO ID'],
      client: req.body['CLIENT REMARK'],
      status: req.body.status || lead.status,
      source: req.body.SOURSE,
      sourceLink: req.body['SOURCE LINK'],
      assignedTo: req.body['SALE PERSON'],
      leadPerson: req.body['LEAD PERSON'],
      feedback: req.body.FEEDBACK,
      updatedAt: Date.now()
    };
    
    // Only include fields that are actually provided in the request
    const finalUpdateData = {};
    for (const [key, value] of Object.entries(updatedData)) {
      if (value !== undefined) {
        finalUpdateData[key] = value;
      }
    }
    
    lead = await Lead.findByIdAndUpdate(req.params.id, finalUpdateData, {
      new: true,
      runValidators: true
    });
    
    res.status(200).json({
      success: true,
      data: lead
    });
  } catch (err) {
    console.error('Error updating lead:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Delete lead
// @route   DELETE /api/leads/:id
// @access  Private
exports.deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: `No lead found with id of ${req.params.id}`
      });
    }
    
    // Check if user is authorized to delete this lead
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete leads'
      });
    }
    
    await lead.deleteOne();
    
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Get leads assigned to sales person
// @route   GET /api/leads/assigned
// @access  Private (Sales Person only)
exports.getAssignedLeads = async (req, res) => {
  try {
    // Verify the user is a Sales Person
    if (req.user.role !== 'Sales Person') {
      return res.status(403).json({
        success: false,
        message: 'Only Sales Persons can access their assigned leads'
      });
    }

    console.log('============= GET ASSIGNED LEADS REQUEST =============');
    console.log('Sales Person:', req.user.fullName);
    console.log('Query parameters:', req.query);
    
    // Extract date filtering parameters from query
    const { month, year, startDate, endDate } = req.query;
    
    let query = Lead.find({ 
      assignedTo: req.user._id 
    });
    
    // Add date filtering if provided
    if (month && year) {
      console.log(`Filtering by month: ${month}, year: ${year}`);
      const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endOfMonth = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
      
      query = query.where('createdAt').gte(startOfMonth).lte(endOfMonth);
      console.log(`Date range: ${startOfMonth.toISOString()} to ${endOfMonth.toISOString()}`);
    } else if (startDate && endDate) {
      console.log(`Filtering by date range: ${startDate} to ${endDate}`);
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include the entire end date
      
      query = query.where('createdAt').gte(start).lte(end);
      console.log(`Date range: ${start.toISOString()} to ${end.toISOString()}`);
    } else if (startDate) {
      console.log(`Filtering from date: ${startDate}`);
      const start = new Date(startDate);
      query = query.where('createdAt').gte(start);
    } else if (endDate) {
      console.log(`Filtering until date: ${endDate}`);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query = query.where('createdAt').lte(end);
    }

    // OPTIMIZATION: Add pagination and limit results
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50; // Limit to 50 leads per request
    const skip = (page - 1) * limit;

    const leads = await query
      .populate('leadPerson', 'fullName email')
      .populate('createdBy', 'fullName email')
      .populate('assignedTo', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // OPTIMIZATION: Use lean() for faster queries

    console.log(`Found ${leads.length} assigned leads for ${req.user.fullName}`);
    
    // Group leads by month/year for better organization
    const leadsByMonth = {};
    leads.forEach(lead => {
      const date = new Date(lead.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!leadsByMonth[monthKey]) {
        leadsByMonth[monthKey] = [];
      }
      leadsByMonth[monthKey].push(lead);
    });
    
    console.log('Leads grouped by month:');
    Object.keys(leadsByMonth).sort().forEach(month => {
      console.log(`- ${month}: ${leadsByMonth[month].length} leads`);
    });
    
    console.log('==============================================');

    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads,
      groupedByMonth: leadsByMonth,
      filters: {
        month: month || null,
        year: year || null,
        startDate: startDate || null,
        endDate: endDate || null
      }
    });
  } catch (err) {
    console.error('Error fetching assigned leads:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Update lead feedback
// @route   PUT /api/leads/:id/feedback
// @access  Private (Sales Person, Lead Person, Manager, Admin)
exports.updateFeedback = async (req, res) => {
  try {
    const { feedback } = req.body;
    
    if (!feedback) {
      return res.status(400).json({
        success: false,
        message: 'Feedback field is required'
      });
    }
    
    let lead = await Lead.findById(req.params.id);
    
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: `No lead found with id of ${req.params.id}`
      });
    }
    
    // Check if user is authorized to update feedback for this lead
    if (
      req.user.role !== 'Admin' && 
      req.user.role !== 'Manager' && 
      lead.assignedTo.toString() !== req.user._id.toString() &&
      !(req.user.role === 'Lead Person' && 
        lead.leadPerson && 
        lead.leadPerson.toString() === req.user._id.toString())
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update feedback for this lead'
      });
    }
    
    // Update only the feedback field and updatedAt
    lead = await Lead.findByIdAndUpdate(
      req.params.id, 
      { 
        feedback, 
        updatedAt: Date.now() 
      }, 
      {
        new: true,
        runValidators: true
      }
    );
    
    res.status(200).json({
      success: true,
      data: lead
    });
  } catch (err) {
    console.error('Error updating feedback:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Import leads from CSV (Google Sheets)
// @route   POST /api/leads/import
// @access  Private (Admin, Manager, Lead Person)
exports.importLeads = async (req, res) => {
  try {
    console.log('=== IMPORT LEADS REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('User:', req.user.fullName, req.user.role);
    
    // Handle both direct leads array and nested data structure
    let leads = req.body.leads;
    if (!leads && req.body.data && req.body.data.leads) {
      leads = req.body.data.leads;
      console.log('Found leads in nested data structure');
    }
    
    if (!leads) {
      console.log('No leads field found in request body');
      return res.status(400).json({
        success: false,
        message: 'No leads field provided in request body'
      });
    }
    
    if (!Array.isArray(leads)) {
      console.log('Leads is not an array:', typeof leads);
      return res.status(400).json({
        success: false,
        message: 'Leads must be an array'
      });
    }
    
    if (leads.length === 0) {
      console.log('Leads array is empty');
      return res.status(400).json({
        success: false,
        message: 'Leads array is empty'
      });
    }
    
    console.log(`Importing ${leads.length} leads from CSV by ${req.user.fullName} (${req.user.role})...`);
    console.log('First lead sample:', JSON.stringify(leads[0], null, 2));
    
    // Map Google Sheets column names to our database fields
    const mappedLeads = leads.map((lead, index) => {
      console.log(`Processing lead ${index + 1}:`, lead);
      
      const leadData = {
        name: lead.Name || lead.name || lead.NAME || '',
        email: lead.Email || lead.email || lead.EMAIL || '',
        course: lead.Course || lead.course || lead.COURSE || '',
        countryCode: lead.CountryCode || lead['Country Code'] || lead.countryCode || lead.COUNTRYCODE || '+1',
        phone: lead.Phone || lead.phone || lead.PHONE || lead.Number || lead.number || lead.NUMBER || '',
        country: lead.Country || lead.country || lead.COUNTRY || '',
        pseudoId: lead.PseudoId || lead.pseudoId || lead.ID || lead.id || lead.PSEUDOID || '',
        company: lead.Company || lead.company || lead.COMPANY || '',
        client: lead.Client || lead.client || lead.CLIENT || '',
        status: lead.Status || lead.status || lead.STATUS || 'Introduction', // Default to Introduction stage
        source: lead.Source || lead.source || lead.SOURCE || '',
        sourceLink: lead.SourceLink || lead['Source Link'] || lead.sourceLink || lead.SOURCELINK || '',
        remarks: lead.Remarks || lead.remarks || lead.REMARKS || '',
        feedback: lead.Feedback || lead.feedback || lead.FEEDBACK || '',
        createdBy: req.user.id,
        // Set the createdAt date from CSV DATE field if available
        createdAt: (() => {
          if (lead.DATE || lead.Date || lead.date) {
            const dateStr = lead.DATE || lead.Date || lead.date;
            console.log(`Processing date: "${dateStr}"`);
            
            // Function to parse DD-MM-YYYY format
            const parseDDMMYYYY = (str) => {
              const ddmmyyyyPattern = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
              const match = str.match(ddmmyyyyPattern);
              if (match) {
                const [, day, month, year] = match;
                // Create date in YYYY-MM-DD format for proper parsing
                const isoFormat = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                console.log(`Detected DD-MM-YYYY format: "${str}" -> "${isoFormat}"`);
                return new Date(isoFormat);
              }
              return null;
            };
            
            // Try DD-MM-YYYY format first
            let parsedDate = parseDDMMYYYY(dateStr);
            
            if (parsedDate && !isNaN(parsedDate.getTime())) {
              console.log(`Successfully parsed DD-MM-YYYY format: ${parsedDate.toISOString()}`);
              return parsedDate;
            }
            
            // Try to parse the date directly (for YYYY-MM-DD and other standard formats)
            parsedDate = new Date(dateStr);
            
            // If the date is invalid, try different formats
            if (isNaN(parsedDate.getTime())) {
              console.log(`Invalid date format: "${dateStr}", trying alternative formats`);
              
              // Try common date formats
              const formats = [
                dateStr.replace(/\//g, '-'), // Convert slashes to dashes
                dateStr.replace(/-/g, '/'), // Convert dashes to slashes
              ];
              
              for (const format of formats) {
                parsedDate = new Date(format);
                if (!isNaN(parsedDate.getTime())) {
                  console.log(`Successfully parsed with format: ${format}`);
                  break;
                }
              }
              
              // If still invalid, use current date
              if (isNaN(parsedDate.getTime())) {
                console.log(`All date formats failed for "${dateStr}", using current date`);
                parsedDate = new Date();
              }
            }
            
            console.log(`Final parsed date: ${parsedDate.toISOString()} (${parsedDate.toString()})`);
            return parsedDate;
          } else {
            console.log('No date field found, using current date');
            return new Date();
          }
        })(),
        updatedAt: new Date()
      };
      
      // FIXED: Look for Lead Person in CSV data FIRST, regardless of who is importing
      if (lead.LeadPerson || lead['Lead Person'] || lead.leadPerson || lead.LEADPERSON || lead['LEAD PERSON']) {
        const leadPersonName = lead.LeadPerson || lead['Lead Person'] || lead.leadPerson || lead.LEADPERSON || lead['LEAD PERSON'];
        leadData.leadPersonName = leadPersonName;
        console.log(`Found Lead Person in CSV: "${leadPersonName}"`);
      } else {
        // If no Lead Person specified in CSV, default to the importing user (only if they are a Lead Person)
        if (req.user.role === 'Lead Person') {
          leadData.leadPerson = req.user._id;
          leadData.assignedTo = req.user._id; // Default assignment to Lead Person
          console.log(`No Lead Person in CSV, defaulting to importing user: ${req.user.fullName}`);
        }
      }
      
      // Look for Sales Person assignment
      if (lead.SalesPerson || lead['Sales Person'] || lead.salesPerson || lead.assignedTo || lead.SALESPERSON || lead['SALES PERSON']) {
        const salesPersonName = lead.SalesPerson || lead['Sales Person'] || lead.salesPerson || lead.assignedTo || lead.SALESPERSON || lead['SALES PERSON'];
        leadData.assignedToName = salesPersonName;
        console.log(`Found Sales Person in CSV: "${salesPersonName}"`);
      }
      
      console.log(`Mapped lead data:`, leadData);
      return leadData;
    });
    
    console.log(`Mapped ${mappedLeads.length} leads`);
    
    // FIXED: Look up and assign Lead Persons and Sales Persons by name for ALL imports
    console.log('Looking up users for automatic assignment...');
    
    // Get all users who could be Lead Persons or Sales Persons
    const User = require('../models/User');
    const allUsers = await User.find({ 
      role: { $in: ['Lead Person', 'Sales Person', 'Admin', 'Manager'] } 
    }).select('_id fullName email role');
    
    console.log(`Found ${allUsers.length} potential assignees:`, allUsers.map(u => `${u.fullName} (${u.role})`));
    
    // Process each mapped lead to assign Lead Persons and Sales Persons
    for (let leadData of mappedLeads) {
      // Assign Lead Person if specified in CSV
      if (leadData.leadPersonName) {
        console.log(`\nLooking for Lead Person: "${leadData.leadPersonName}"`);
        
        // Try to find a matching Lead Person by name
        const matchingLeadPerson = allUsers.find(user => {
          if (user.role !== 'Lead Person') return false;
          
          const userName = user.fullName.toLowerCase();
          const searchName = leadData.leadPersonName.toLowerCase();
          
          // Try exact match first
          if (userName === searchName) return true;
          
          // Try partial match (contains)
          if (userName.includes(searchName) || searchName.includes(userName)) return true;
          
          // Try first name match
          const userFirstName = userName.split(' ')[0];
          const searchFirstName = searchName.split(' ')[0];
          if (userFirstName === searchFirstName) return true;
          
          return false;
        });
        
        if (matchingLeadPerson) {
          leadData.leadPerson = matchingLeadPerson._id;
          console.log(`✅ Lead Person assigned to: ${matchingLeadPerson.fullName}`);
          
          // If no sales person specified, default assign to the Lead Person
          if (!leadData.assignedToName) {
            leadData.assignedTo = matchingLeadPerson._id;
            console.log(`✅ Also assigned to Lead Person as default assignee`);
          }
        } else {
          console.log(`❌ No matching Lead Person found for "${leadData.leadPersonName}"`);
          console.log('Available Lead Persons:', allUsers.filter(u => u.role === 'Lead Person').map(u => u.fullName).join(', '));
          
          // Fallback to importing user if they are a Lead Person
          if (req.user.role === 'Lead Person') {
            leadData.leadPerson = req.user._id;
            leadData.assignedTo = req.user._id;
            console.log(`Fallback: Assigned to importing Lead Person: ${req.user.fullName}`);
          }
        }
        
        // Remove the temporary name field
        delete leadData.leadPersonName;
      }
      
      // Assign Sales Person if specified in CSV
      if (leadData.assignedToName) {
        console.log(`\nLooking for Sales Person: "${leadData.assignedToName}"`);
        
        // Try to find a matching user by name (Sales Person, Admin, or Manager)
        const matchingSalesPerson = allUsers.find(user => {
          if (!['Sales Person', 'Admin', 'Manager'].includes(user.role)) return false;
          
          const userName = user.fullName.toLowerCase();
          const searchName = leadData.assignedToName.toLowerCase();
          
          // Try exact match first
          if (userName === searchName) return true;
          
          // Try partial match (contains)
          if (userName.includes(searchName) || searchName.includes(userName)) return true;
          
          // Try first name match
          const userFirstName = userName.split(' ')[0];
          const searchFirstName = searchName.split(' ')[0];
          if (userFirstName === searchFirstName) return true;
          
          return false;
        });
        
        if (matchingSalesPerson) {
          leadData.assignedTo = matchingSalesPerson._id;
          console.log(`✅ Sales Person assigned to: ${matchingSalesPerson.fullName} (${matchingSalesPerson.role})`);
        } else {
          console.log(`❌ No matching Sales Person found for "${leadData.assignedToName}"`);
          console.log('Available Sales Persons:', allUsers.filter(u => ['Sales Person', 'Admin', 'Manager'].includes(u.role)).map(u => u.fullName).join(', '));
          
          // Keep existing assignment (Lead Person or importing user)
          console.log(`Keeping existing assignment`);
        }
        
        // Remove the temporary name field
        delete leadData.assignedToName;
      }
    }
    
    // Validate the mapped data - make validation more flexible
    const validLeads = mappedLeads.filter((lead, index) => {
      const isValid = lead.name && (lead.phone || lead.email) && lead.course;
      if (!isValid) {
        console.log(`Lead ${index + 1} is invalid:`, {
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          course: lead.course,
          hasName: !!lead.name,
          hasContact: !!(lead.phone || lead.email),
          hasCourse: !!lead.course
        });
      }
      return isValid;
    });
    
    console.log(`Found ${validLeads.length} valid leads out of ${mappedLeads.length}`);
    
    if (validLeads.length === 0) {
      console.log('No valid leads found');
      return res.status(400).json({
        success: false,
        message: 'No valid leads found in the imported data. Required fields: Name, Phone/Email, Course',
        details: 'Make sure your CSV has columns for Name, Phone (or Email), and Course'
      });
    }
    
    // Insert the leads into the database
    console.log('Attempting to insert leads into database...');
    const results = await Lead.insertMany(validLeads, { 
      ordered: false // Continue processing even if some documents have errors
    });
    
    console.log(`Successfully imported ${results.length} leads`);
    
    // Log assignment info for debugging
    if (req.user.role === 'Lead Person') {
      console.log(`All imported leads assigned to Lead Person: ${req.user.fullName}`);
      
      // Count how many were auto-assigned to sales persons
      const autoAssigned = results.filter(lead => 
        lead.assignedTo && lead.assignedTo.toString() !== req.user._id.toString()
      ).length;
      
      if (autoAssigned > 0) {
        console.log(`${autoAssigned} leads were automatically assigned to sales persons from CSV data`);
      }
    }
    
    res.status(201).json({
      success: true,
      count: results.length,
      data: results,
      message: `Successfully imported ${results.length} leads. ${
        req.user.role === 'Lead Person' 
          ? 'Leads with sales person names in CSV were automatically assigned. Others assigned to you as Lead Person.' 
          : ''
      }`,
      skipped: mappedLeads.length - results.length
    });
  } catch (err) {
    console.error('Lead import error:', err);
    console.error('Error stack:', err.stack);
    res.status(400).json({
      success: false,
      message: err.message || 'Import failed',
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// @desc    Get all customer leads (including reference sales)
// @route   GET /api/leads/customers
// @access  Private (Sales Person only)
exports.getAllCustomers = async (req, res) => {
  try {
    console.log('Getting all customers (leads + reference sales) for:', req.user.fullName);
    
    // 1. Get assigned leads first
    const leads = await Lead.find({ 
      assignedTo: req.user._id 
    })
    .populate('leadPerson', 'fullName email')
    .populate('createdBy', 'fullName email')
    .populate('assignedTo', 'fullName email')
    .sort({ createdAt: -1 });
    
    console.log(`Found ${leads.length} assigned leads`);
    
    // 2. Get reference sales for this sales person
    const Sale = require('../models/Sale');
    const referenceSales = await Sale.find({
      salesPerson: req.user._id,
      isReference: true
    })
    .sort({ date: -1 });
    
    console.log(`Found ${referenceSales.length} reference sales`);
    
    // 3. Convert reference sales to lead-like format
    const referenceSalesAsLeads = referenceSales.map(sale => {
      return {
        _id: sale._id, // Use the sale ID
        name: sale.customerName,
        email: sale.email,
        phone: sale.contactNumber,
        countryCode: sale.countryCode,
        country: sale.country,
        course: sale.course,
        source: 'Reference Sale',
        status: sale.status,
        assignedTo: sale.salesPerson,
        leadPerson: sale.leadPerson,
        createdBy: sale.createdBy,
        createdAt: sale.date || sale.createdAt,
        updatedAt: sale.updatedAt,
        isReferenceSale: true // Flag to indicate this is actually a reference sale
      };
    });
    
    // 4. Combine both sets of data
    const allCustomers = [...leads, ...referenceSalesAsLeads];
    
    console.log(`Returning ${allCustomers.length} total customers (${leads.length} leads + ${referenceSalesAsLeads.length} reference sales)`);
    
    res.status(200).json({
      success: true,
      count: allCustomers.length,
      data: allCustomers
    });
  } catch (err) {
    console.error('Error fetching all customers:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get repeated customer information
// @route   GET /api/leads/repeat-customers
// @access  Private (Admin, Manager)
exports.getRepeatCustomers = async (req, res) => {
  try {
    console.log('============= GET REPEAT CUSTOMERS =============');
    console.log('User making request:', {
      id: req.user._id,
      role: req.user.role,
      name: req.user.fullName
    });
    
    // Only allow admin and manager to access this data
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access repeat customer data'
      });
    }
    
    // Find all leads marked as repeat customers
    const repeatCustomers = await Lead.find({ isRepeatCustomer: true })
      .populate('assignedTo', 'fullName email')
      .populate('leadPerson', 'fullName email')
      .populate('relatedLeads', 'name course createdAt')
      .sort({ createdAt: -1 });
    
    // Group customers by contact info to find all unique customers
    const uniqueCustomerMap = new Map();
    
    repeatCustomers.forEach(lead => {
      // Create a unique key based on contact info
      const key = `${lead.phone}|${lead.email}`;
      
      if (!uniqueCustomerMap.has(key)) {
        uniqueCustomerMap.set(key, {
          customerInfo: {
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            countryCode: lead.countryCode,
            country: lead.country
          },
          leads: []
        });
      }
      
      // Add this lead and related leads to the customer's records
      const customerData = uniqueCustomerMap.get(key);
      
      // Add the current lead
      customerData.leads.push({
        _id: lead._id,
        course: lead.course,
        createdAt: lead.createdAt,
        salesPerson: lead.assignedTo ? lead.assignedTo.fullName : 'Unassigned',
        previousCourses: lead.previousCourses
      });
      
      // Add related leads if they're not already included
      if (lead.relatedLeads && lead.relatedLeads.length > 0) {
        lead.relatedLeads.forEach(relatedLead => {
          // Check if this related lead is already in the list
          const alreadyIncluded = customerData.leads.some(l => 
            l._id.toString() === relatedLead._id.toString()
          );
          
          if (!alreadyIncluded) {
            customerData.leads.push({
              _id: relatedLead._id,
              course: relatedLead.course,
              createdAt: relatedLead.createdAt,
              salesPerson: 'Unknown' // We don't have this info from the populated data
            });
          }
        });
      }
      
      // Sort leads by date
      customerData.leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    });
    
    // Convert the map to an array
    const uniqueCustomers = Array.from(uniqueCustomerMap.values());
    
    // Calculate some statistics
    const stats = {
      totalRepeatCustomers: uniqueCustomers.length,
      totalLeads: repeatCustomers.length,
      averageCoursesPerCustomer: uniqueCustomers.length > 0 
        ? (repeatCustomers.length / uniqueCustomers.length).toFixed(2) 
        : 0
    };
    
    console.log(`Found ${stats.totalRepeatCustomers} unique repeat customers with ${stats.totalLeads} total leads`);
    console.log('==============================================');
    
    res.status(200).json({
      success: true,
      stats,
      data: uniqueCustomers
    });
  } catch (err) {
    console.error('Error getting repeat customers:', err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Get lead statistics
// @route   GET /api/leads/stats
// @access  Private
exports.getLeadStats = async (req, res) => {
  try {
    const filter = {};
    
    // Role-based filtering
    if (req.user.role === 'Sales Person') {
      filter.assignedTo = req.user._id;
    }

    const stats = await Lead.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          new: { $sum: { $cond: [{ $eq: ['$status', 'New'] }, 1, 0] } },
          contacted: { $sum: { $cond: [{ $eq: ['$status', 'Contacted'] }, 1, 0] } },
          interested: { $sum: { $cond: [{ $eq: ['$status', 'Interested'] }, 1, 0] } },
          qualified: { $sum: { $cond: [{ $eq: ['$status', 'Qualified'] }, 1, 0] } },
          converted: { $sum: { $cond: [{ $eq: ['$status', 'Converted to Sale'] }, 1, 0] } },
          lost: { $sum: { $cond: [{ $eq: ['$status', 'Lost'] }, 1, 0] } }
        }
      }
    ]);

    const sourceStats = await Lead.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const result = {
      overview: stats[0] || {
        total: 0,
        new: 0,
        contacted: 0,
        interested: 0,
        qualified: 0,
        converted: 0,
        lost: 0
      },
      sources: sourceStats
    };

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error getting lead stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}; 