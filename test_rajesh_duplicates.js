const axios = require('axios');

const BASE_URL = 'http://localhost:8080/api';

async function testRajeshDuplicates() {
  try {
    console.log('🔐 Authenticating as admin...');
    
    // Login with provided admin credentials
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'SK@gmail.com',
      password: 'Canada@1212'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Authentication successful');
    
    // Set up headers with token
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    console.log('\n🔍 Checking Rajesh duplicates...');
    
    // Check for duplicates
    const checkResponse = await axios.get(`${BASE_URL}/leads/check-rajesh-duplicates`, { headers });
    
    const data = checkResponse.data.data;
    
    console.log('\n📊 Results:');
    console.log(`Rajesh: ${data.rajesh.name} (${data.rajesh.id})`);
    console.log(`Total leads: ${data.totalLeads}`);
    
    console.log('\n📅 Leads by month:');
    data.leadsByMonth.forEach(month => {
      console.log(`  ${month.month}: ${month.count} leads`);
    });
    
    console.log(`\n🔍 September 2024 leads: ${data.sep2024Leads.length}`);
    if (data.sep2024Leads.length > 0) {
      data.sep2024Leads.forEach((lead, i) => {
        console.log(`  ${i+1}. ${lead.name} - ${lead.phone} - ${lead.course}`);
      });
    }
    
    console.log(`\n🔍 June 2025 leads: ${data.jun2025Leads.length}`);
    if (data.jun2025Leads.length > 0) {
      data.jun2025Leads.forEach((lead, i) => {
        console.log(`  ${i+1}. ${lead.name} - ${lead.phone} - ${lead.course}`);
      });
    }
    
    console.log(`\n⚠️  Duplicates found: ${data.duplicateCount}`);
    if (data.duplicates.length > 0) {
      data.duplicates.forEach((dup, i) => {
        console.log(`  ${i+1}. Sep 2024: ${dup.sep2024.name} (${dup.sep2024.phone})`);
        console.log(`     Jun 2025: ${dup.jun2025.name} (${dup.jun2025.phone})`);
        console.log(`     Jun 2025 ID: ${dup.jun2025.id}`);
      });
      
      // Remove duplicates
      console.log('\n🗑️  Removing duplicate June 2025 leads...');
      
      const removeResponse = await axios.delete(`${BASE_URL}/leads/remove-rajesh-duplicates`, { headers });
      
      console.log('✅ Removal result:', removeResponse.data.message);
      console.log(`   Removed count: ${removeResponse.data.removedCount}`);
      
    } else {
      console.log('✅ No duplicates found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.error('Response data:', error.response.data);
    }
  }
}

testRajeshDuplicates(); 