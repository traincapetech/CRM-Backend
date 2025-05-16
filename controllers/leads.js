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
    
    // Sort by created date, newest first
    query = query.sort({ createdAt: -1 });
    
    // Populate relevant fields
    query = query.populate('assignedTo', 'fullName email role')
                .populate('leadPerson', 'fullName email role');
    
    // Execute the query
    const leads = await query;
    
    console.log(`Found ${leads.length} leads for this user`);
    
    // Log lead details for debugging
    if (leads.length > 0) {
      console.log('Lead details:');
      leads.forEach(lead => {
        console.log(`- Lead ID: ${lead._id}, Name: ${lead.name}, Date: ${lead.createdAt}`);
        console.log(`  Assigned to: ${lead.assignedTo ? lead.assignedTo.fullName + ' (ID: ' + lead.assignedTo._id + ')' : 'None'}`);
      });
    } else {
      // If no leads were found, check ALL leads in the database to see why
      console.log('No leads found for this user. Checking all leads:');
      const allLeads = await Lead.find({}).populate('assignedTo', 'fullName email role');
      
      console.log(`Total leads in database: ${allLeads.length}`);
      allLeads.forEach(lead => {
        const assignedUserId = lead.assignedTo ? lead.assignedTo._id.toString() : 'None';
        const currentUserId = req.user._id.toString();
        const isMatch = assignedUserId === currentUserId;
        
        console.log(`- Lead "${lead.name}" is assigned to: ${lead.assignedTo ? lead.assignedTo.fullName : 'None'} (ID: ${assignedUserId})`);
        console.log(`  Current user ID: ${currentUserId}, Match: ${isMatch}`);
      });
    }
    
    console.log('==============================================');
    
    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads
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
      createdAt: req.body.DATE ? new Date(req.body.DATE) : lead.createdAt,
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

    const leads = await Lead.find({ 
      assignedTo: req.user._id 
    })
    .populate('leadPerson', 'fullName email')
    .populate('createdBy', 'fullName email')
    .populate('assignedTo', 'fullName email')
    .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads
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
// @access  Private (Admin only)
exports.importLeads = async (req, res) => {
  try {
    const { leads } = req.body;
    
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No leads data provided or invalid format'
      });
    }
    
    console.log(`Importing ${leads.length} leads from CSV...`);
    
    // Map Google Sheets column names to our database fields
    const mappedLeads = leads.map(lead => {
      // This is an example mapping - adjust based on your actual CSV columns
      return {
        name: lead.Name || lead.name || '',
        email: lead.Email || lead.email || '',
        course: lead.Course || lead.course || '',
        countryCode: lead.CountryCode || lead['Country Code'] || lead.countryCode || '+1',
        phone: lead.Phone || lead.phone || '',
        country: lead.Country || lead.country || '',
        pseudoId: lead.PseudoId || lead.pseudoId || lead.ID || lead.id || '',
        company: lead.Company || lead.company || '',
        client: lead.Client || lead.client || '',
        status: lead.Status || lead.status || 'New',
        source: lead.Source || lead.source || '',
        sourceLink: lead.SourceLink || lead['Source Link'] || lead.sourceLink || '',
        remarks: lead.Remarks || lead.remarks || '',
        feedback: lead.Feedback || lead.feedback || '',
        // Set created by to the current user (admin)
        createdBy: req.user.id
      };
    });
    
    // Validate the mapped data
    const validLeads = mappedLeads.filter(lead => 
      lead.name && lead.email && lead.phone && lead.course && lead.country
    );
    
    if (validLeads.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid leads found in the imported data'
      });
    }
    
    console.log(`Found ${validLeads.length} valid leads out of ${leads.length}`);
    
    // Insert the leads into the database
    const results = await Lead.insertMany(validLeads, { 
      ordered: false // Continue processing even if some documents have errors
    });
    
    console.log(`Successfully imported ${results.length} leads`);
    
    res.status(201).json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (err) {
    console.error('Lead import error:', err);
    res.status(400).json({
      success: false,
      message: err.message
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