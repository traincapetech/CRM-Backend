const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const OfficeNetwork = require('../models/OfficeNetwork');

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI environment variable is missing.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  await mongoose.connect(mongoUri);
  console.log('Connected.');

  console.log('Finding Ukhrul Branch office network...');
  const ukhrulNetwork = await OfficeNetwork.findOne({ officeName: 'Ukhrul Branch' });

  if (!ukhrulNetwork) {
    console.error('❌ "Ukhrul Branch" office network not found in database.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('Current Ukhrul Branch document:');
  console.log(JSON.stringify(ukhrulNetwork, null, 2));

  // Define new public IPs to add while keeping existing ones
  const newIPs = [
    '106.215.0.0/16', // Existing
    '122.183.57.15',  // Exact IPv4
    '122.183.0.0/16', // Airtel IPv4 range (dynamic WiFi reset fallback)
    '2401:4900:8f87:b514:8e8:858f:d6f0:2d77', // Exact IPv6
    '2401:4900:8f87:b514::/64', // Jio IPv6 subnet prefix (dynamic WiFi reset fallback)
    '2401:4900::/32'  // Broad Jio IPv6 prefix range (dynamic WiFi reset fallback)
  ];

  // Merge, remove duplicates, and filter empty strings
  const combinedIPs = [...new Set([...(ukhrulNetwork.publicIPs || []), ...newIPs])]
    .map(ip => ip.trim())
    .filter(ip => ip !== '');

  console.log('Updating publicIPs to:', combinedIPs);
  
  ukhrulNetwork.publicIPs = combinedIPs;
  await ukhrulNetwork.save();

  console.log('✅ "Ukhrul Branch" office network updated successfully!');
  
  // Fetch fresh document to verify
  const updatedNetwork = await OfficeNetwork.findById(ukhrulNetwork._id);
  console.log('Updated Ukhrul Branch document:');
  console.log(JSON.stringify(updatedNetwork, null, 2));

  await mongoose.disconnect();
  console.log('Disconnected.');
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
