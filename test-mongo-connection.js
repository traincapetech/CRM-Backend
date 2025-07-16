const mongoose = require('mongoose');
const dns = require('dns');

async function testConnection() {
  try {
    // Get MongoDB URI from environment
    const mongoUri = process.env.MONGO_URI;
    
    if (!mongoUri) {
      console.error('❌ MONGO_URI is not set in environment variables');
      return;
    }

    // Extract hostname from URI
    const match = mongoUri.match(/mongodb(?:\+srv)?:\/\/([^/:]+)/);
    if (!match) {
      console.error('❌ Invalid MongoDB URI format');
      return;
    }

    const hostname = match[1];
    
    // Test DNS resolution
    console.log(`🔍 Testing DNS resolution for ${hostname}...`);
    try {
      const addresses = await new Promise((resolve, reject) => {
        dns.resolve(hostname, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses);
        });
      });
      console.log('✅ DNS resolution successful:', addresses);
    } catch (dnsError) {
      console.error('❌ DNS resolution failed:', dnsError.message);
      console.log('\n👉 Possible solutions:');
      console.log('1. Check your internet connection');
      console.log('2. Verify the cluster name in MONGO_URI is correct');
      console.log('3. Ensure the MongoDB Atlas cluster is running');
      console.log('4. Try using a different DNS server');
      return;
    }

    // Test MongoDB connection
    console.log('\n🔍 Testing MongoDB connection...');
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000 // 5 second timeout
    });

    console.log('✅ Successfully connected to MongoDB!');
    console.log(`📍 Connected to: ${mongoose.connection.host}`);
    
    // Test basic operation
    console.log('\n🔍 Testing basic database operation...');
    const pingResult = await mongoose.connection.db.admin().ping();
    console.log('✅ Database ping successful:', pingResult);

  } catch (error) {
    console.error('\n❌ Connection error:', error.message);
    console.log('\n👉 Error details:', error);
    console.log('\n👉 Possible solutions:');
    console.log('1. Verify MONGO_URI is correct');
    console.log('2. Check if IP whitelist includes your current IP');
    console.log('3. Verify database user credentials');
    console.log('4. Ensure the cluster is running and accessible');
  } finally {
    await mongoose.disconnect();
  }
}

testConnection().catch(console.error); 