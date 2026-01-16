const mongoose = require('mongoose');
const Lead = require('./models/Lead');
const User = require('./models/User');

mongoose.connect('mongodb://localhost:27017/crm', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function checkRajeshLeads() {
  try {
    // Find Rajesh
    const rajesh = await User.findOne({ fullName: /rajesh/i });
    if (!rajesh) {
      console.log('❌ Rajesh not found');
      return;
    }
    
    console.log('✅ Found Rajesh:', rajesh.fullName, rajesh._id);
    
    // Get all leads assigned to Rajesh
    const leads = await Lead.find({ assignedTo: rajesh._id }).sort({ createdAt: 1 });
    
    console.log(`\nTotal leads assigned to Rajesh: ${leads.length}`);
    
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
    
    console.log('\n📊 Leads by month:');
    Object.keys(leadsByMonth).sort().forEach(month => {
      console.log(`${month}: ${leadsByMonth[month].length} leads`);
    });
    
    // Check for September 2024 leads
    const sep2024 = leadsByMonth['2024-09'] || [];
    const jun2025 = leadsByMonth['2025-06'] || [];
    
    console.log(`\n🔍 September 2024 leads: ${sep2024.length}`);
    if (sep2024.length > 0) {
      sep2024.forEach((lead, i) => {
        console.log(`  ${i+1}. ${lead.name} - ${lead.phone} - ${lead.course} - ${lead.createdAt}`);
      });
    }
    
    console.log(`\n🔍 June 2025 leads: ${jun2025.length}`);
    if (jun2025.length > 0) {
      jun2025.forEach((lead, i) => {
        console.log(`  ${i+1}. ${lead.name} - ${lead.phone} - ${lead.course} - ${lead.createdAt}`);
      });
    }
    
    // Look for potential duplicates (same name or phone)
    if (sep2024.length > 0 && jun2025.length > 0) {
      console.log('\n🔍 Checking for duplicates between Sep 2024 and Jun 2025...');
      
      const duplicates = [];
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
      
      if (duplicates.length > 0) {
        console.log(`\n⚠️  Found ${duplicates.length} potential duplicates:`);
        duplicates.forEach((dup, i) => {
          console.log(`  ${i+1}. Sep 2024: ${dup.sep2024.name} (${dup.sep2024.phone})`);
          console.log(`     Jun 2025: ${dup.jun2025.name} (${dup.jun2025.phone})`);
          console.log(`     Jun 2025 ID: ${dup.jun2025.id}`);
        });
        
        // Store duplicate IDs for removal
        global.duplicateIds = duplicates.map(dup => dup.jun2025.id);
        console.log(`\n📝 Duplicate June 2025 IDs to remove: ${global.duplicateIds.join(', ')}`);
      } else {
        console.log('✅ No duplicates found based on name/phone matching');
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkRajeshLeads(); 