const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI);

const Lead = require('./models/Lead');
const User = require('./models/User');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function assignLeads() {
  try {
    console.log('🔧 LEAD ASSIGNMENT TOOL 🔧\n');
    
    // Show available Lead Persons
    const leadPersons = await User.find({ role: 'Lead Person' });
    console.log('=== AVAILABLE LEAD PERSONS ===');
    leadPersons.forEach((lp, index) => {
      console.log(`${index + 1}. ${lp.fullName}`);
    });
    
    // Show unassigned leads by month
    const unassignedLeads = await Lead.find({
      $or: [
        { leadPerson: null },
        { leadPerson: { $exists: false } },
        { assignedTo: null },
        { assignedTo: { $exists: false } }
      ]
    }).sort({ createdAt: -1 });
    
    console.log(`\n=== UNASSIGNED LEADS ===`);
    console.log(`Total unassigned leads: ${unassignedLeads.length}`);
    
    // Group by month
    const leadsByMonth = {};
    unassignedLeads.forEach(lead => {
      const date = new Date(lead.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      
      if (!leadsByMonth[monthKey]) {
        leadsByMonth[monthKey] = { name: monthName, count: 0, leads: [] };
      }
      leadsByMonth[monthKey].count++;
      leadsByMonth[monthKey].leads.push(lead);
    });
    
    console.log('\nUnassigned leads by month:');
    Object.entries(leadsByMonth).forEach(([key, data]) => {
      console.log(`- ${data.name}: ${data.count} leads`);
    });
    
    if (unassignedLeads.length === 0) {
      console.log('\n✅ No unassigned leads found!');
      process.exit(0);
    }
    
    // Ask for Lead Person
    const leadPersonAnswer = await new Promise((resolve) => {
      rl.question('\n👤 Enter Lead Person number (1-' + leadPersons.length + '): ', resolve);
    });
    
    const selectedLeadPerson = leadPersons[parseInt(leadPersonAnswer) - 1];
    if (!selectedLeadPerson) {
      console.log('❌ Invalid Lead Person selection');
      process.exit(1);
    }
    
    console.log(`✅ Selected: ${selectedLeadPerson.fullName}`);
    
    // Ask for month
    const monthKeys = Object.keys(leadsByMonth).sort();
    console.log('\n📅 Available months:');
    monthKeys.forEach((key, index) => {
      console.log(`${index + 1}. ${leadsByMonth[key].name} (${leadsByMonth[key].count} leads)`);
    });
    
    const monthAnswer = await new Promise((resolve) => {
      rl.question('\n📅 Enter month number (1-' + monthKeys.length + ') or "all" for all months: ', resolve);
    });
    
    let leadsToAssign = [];
    if (monthAnswer.toLowerCase() === 'all') {
      leadsToAssign = unassignedLeads;
      console.log(`✅ Selected: All months (${unassignedLeads.length} leads)`);
    } else {
      const selectedMonthKey = monthKeys[parseInt(monthAnswer) - 1];
      if (!selectedMonthKey) {
        console.log('❌ Invalid month selection');
        process.exit(1);
      }
      leadsToAssign = leadsByMonth[selectedMonthKey].leads;
      console.log(`✅ Selected: ${leadsByMonth[selectedMonthKey].name} (${leadsToAssign.length} leads)`);
    }
    
    // Confirm assignment
    const confirmAnswer = await new Promise((resolve) => {
      rl.question(`\n⚠️  Assign ${leadsToAssign.length} leads to ${selectedLeadPerson.fullName}? (yes/no): `, resolve);
    });
    
    if (confirmAnswer.toLowerCase() !== 'yes') {
      console.log('❌ Assignment cancelled');
      process.exit(0);
    }
    
    // Perform the assignment
    console.log('\n🔄 Assigning leads...');
    
    const leadIds = leadsToAssign.map(lead => lead._id);
    const updateResult = await Lead.updateMany(
      { _id: { $in: leadIds } },
      {
        $set: {
          leadPerson: selectedLeadPerson._id,
          assignedTo: selectedLeadPerson._id,
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`✅ Successfully assigned ${updateResult.modifiedCount} leads to ${selectedLeadPerson.fullName}`);
    
    // Verify the assignment
    const verifyLeads = await Lead.find({
      _id: { $in: leadIds },
      leadPerson: selectedLeadPerson._id
    }).populate('leadPerson', 'fullName');
    
    console.log(`\n📋 Verification: ${verifyLeads.length} leads now assigned to ${selectedLeadPerson.fullName}`);
    
    if (verifyLeads.length > 0) {
      console.log('\nSample of assigned leads:');
      verifyLeads.slice(0, 5).forEach((lead, index) => {
        console.log(`${index + 1}. ${lead.name} (${new Date(lead.createdAt).toLocaleDateString()})`);
      });
    }
    
    console.log(`\n🎉 Assignment complete! ${selectedLeadPerson.fullName} can now see these leads in their Lead Person dashboard.`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

assignLeads(); 