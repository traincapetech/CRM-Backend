const express = require('express');
const router = express.Router();
const {
  getLeads,
  getLead,
  createLead,
  updateLead,
  deleteLead,
  updateFeedback,
  getAssignedLeads,
  importLeads,
  getAllCustomers,
  getRepeatCustomers,
  getLeadStats
} = require('../controllers/leads');

const { protect, authorize } = require('../middleware/auth');

// All routes below this line require authentication
router.use(protect);

// Routes specific to roles
router.route('/')
  .get(authorize('Lead Person', 'Sales Person', 'Manager', 'Admin'), getLeads)
  .post(authorize('Lead Person', 'Sales Person', 'Manager', 'Admin'), createLead);

// Import route (Admin, Manager, Lead Person)
router.post('/import', authorize('Admin', 'Manager', 'Lead Person'), importLeads);

// Stats route (Admin, Manager, Lead Person, Sales Person)
router.get('/stats', authorize('Admin', 'Manager', 'Lead Person', 'Sales Person'), getLeadStats);

// Repeat customers route (Admin/Manager only)
router.get('/repeat-customers', authorize('Admin', 'Manager'), getRepeatCustomers);

// The '/assigned' route must come BEFORE the '/:id' route
router.get('/assigned', authorize('Sales Person'), getAssignedLeads);
router.get('/customers', authorize('Sales Person'), getAllCustomers);

// Rajesh duplicate checking routes - must come before /:id route
router.get('/check-rajesh-duplicates', authorize('Admin', 'Manager'), async (req, res) => {
  try {
    console.log('=== CHECKING RAJESH DUPLICATES ===');
    
    // Find Rajesh
    const User = require('../models/User');
    const Lead = require('../models/Lead');
    const rajesh = await User.findOne({ fullName: /rajesh/i });
    if (!rajesh) {
      return res.status(404).json({
        success: false,
        message: 'Rajesh not found'
      });
    }
    
    console.log('✅ Found Rajesh:', rajesh.fullName, rajesh._id);
    
    // Get all leads assigned to Rajesh
    const leads = await Lead.find({ assignedTo: rajesh._id }).sort({ createdAt: 1 });
    
    console.log(`Total leads assigned to Rajesh: ${leads.length}`);
    
    // Group by month/year
    const leadsByMonth = {};
    leads.forEach(lead => {
      const date = new Date(lead.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!leadsByMonth[monthKey]) {
        leadsByMonth[monthKey] = [];
      }
      leadsByMonth[monthKey].push({
        id: lead._id,
        name: lead.name,
        phone: lead.phone,
        course: lead.course,
        createdAt: lead.createdAt
      });
    });
    
    console.log('📊 Leads by month:');
    Object.keys(leadsByMonth).sort().forEach(month => {
      console.log(`${month}: ${leadsByMonth[month].length} leads`);
    });
    
    // Check for September 2024 and June 2025 leads
    const sep2024 = leadsByMonth['2024-09'] || [];
    const jun2025 = leadsByMonth['2025-06'] || [];
    
    // Look for potential duplicates (same name or phone)
    const duplicates = [];
    if (sep2024.length > 0 && jun2025.length > 0) {
      sep2024.forEach(sepLead => {
        jun2025.forEach(junLead => {
          if (sepLead.name === junLead.name || sepLead.phone === junLead.phone) {
            duplicates.push({
              sep2024: sepLead,
              jun2025: junLead
            });
          }
        });
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        rajesh: {
          id: rajesh._id,
          name: rajesh.fullName
        },
        totalLeads: leads.length,
        leadsByMonth: Object.keys(leadsByMonth).sort().map(month => ({
          month,
          count: leadsByMonth[month].length
        })),
        sep2024Leads: sep2024,
        jun2025Leads: jun2025,
        duplicates: duplicates,
        duplicateCount: duplicates.length
      }
    });
    
  } catch (error) {
    console.error('Error checking duplicates:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.delete('/remove-rajesh-duplicates', authorize('Admin', 'Manager'), async (req, res) => {
  try {
    console.log('=== REMOVING RAJESH DUPLICATES ===');
    
    // Find Rajesh
    const User = require('../models/User');
    const Lead = require('../models/Lead');
    const rajesh = await User.findOne({ fullName: /rajesh/i });
    if (!rajesh) {
      return res.status(404).json({
        success: false,
        message: 'Rajesh not found'
      });
    }
    
    // Get September 2024 and June 2025 leads
    const sep2024Start = new Date('2024-09-01');
    const sep2024End = new Date('2024-09-30T23:59:59.999Z');
    const jun2025Start = new Date('2025-06-01');
    const jun2025End = new Date('2025-06-30T23:59:59.999Z');
    
    const sep2024Leads = await Lead.find({
      assignedTo: rajesh._id,
      createdAt: { $gte: sep2024Start, $lte: sep2024End }
    });
    
    const jun2025Leads = await Lead.find({
      assignedTo: rajesh._id,
      createdAt: { $gte: jun2025Start, $lte: jun2025End }
    });
    
    console.log(`Found ${sep2024Leads.length} September 2024 leads`);
    console.log(`Found ${jun2025Leads.length} June 2025 leads`);
    
    // Find duplicates to remove from June 2025
    const duplicatesToRemove = [];
    sep2024Leads.forEach(sepLead => {
      jun2025Leads.forEach(junLead => {
        if (sepLead.name === junLead.name || sepLead.phone === junLead.phone) {
          duplicatesToRemove.push(junLead._id);
        }
      });
    });
    
    if (duplicatesToRemove.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No duplicates found to remove',
        removedCount: 0
      });
    }
    
    console.log(`Removing ${duplicatesToRemove.length} duplicate leads from June 2025`);
    
    // Remove the duplicate leads from June 2025
    const result = await Lead.deleteMany({
      _id: { $in: duplicatesToRemove }
    });
    
    console.log(`Successfully removed ${result.deletedCount} duplicate leads`);
    
    res.status(200).json({
      success: true,
      message: `Successfully removed ${result.deletedCount} duplicate leads from June 2025`,
      removedCount: result.deletedCount,
      removedIds: duplicatesToRemove
    });
    
  } catch (error) {
    console.error('Error removing duplicates:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.route('/:id')
  .get(authorize('Lead Person','Sales Person', 'Manager', 'Admin'), getLead)
  .put(authorize('Lead Person', 'Manager', 'Admin', 'Sales Person'), updateLead)
  .delete(authorize('Sales Person', 'Manager', 'Admin'), deleteLead);

router.put('/:id/feedback', authorize('Sales Person', 'Lead Person', 'Manager', 'Admin'), updateFeedback);

module.exports = router; 