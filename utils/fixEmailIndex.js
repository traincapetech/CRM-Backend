/**
 * Utility script to drop the unique email index from the leads collection
 * 
 * Usage: 
 * 1. Make sure MongoDB connection details are in .env
 * 2. Run with: node server/utils/fixEmailIndex.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

const dropEmailIndex = async () => {
  try {
    console.log('Connecting to MongoDB...');
    const conn = await connectDB();
    
    console.log('Listing existing indexes on leads collection...');
    const indexes = await conn.connection.db.collection('leads').indexes();
    console.log('Current indexes:');
    indexes.forEach(index => {
      console.log(`- ${index.name}: ${JSON.stringify(index.key)}`);
    });
    
    // Find and drop any email index
    const emailIndexes = indexes.filter(index => index.key.email);
    if (emailIndexes.length > 0) {
      console.log(`Found ${emailIndexes.length} email indexes. Dropping them...`);
      for (const index of emailIndexes) {
        console.log(`Dropping index: ${index.name}`);
        await conn.connection.db.collection('leads').dropIndex(index.name);
        console.log(`Successfully dropped index: ${index.name}`);
      }
    } else {
      console.log('No email indexes found. No action needed.');
    }
    
    console.log('Operation complete. Disconnecting...');
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error(`Error: ${error.message}`);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Run the function
dropEmailIndex(); 