const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function checkUsers() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/crm');
    console.log('✅ Connected to database');
    
    const users = await User.find({}).select('email fullName role createdAt');
    console.log('👥 Users in database:');
    users.forEach(user => {
      console.log(`- ${user.email} (${user.fullName}) - ${user.role}`);
    });
    
    if (users.length === 0) {
      console.log('⚠️ No users found in database');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkUsers(); 