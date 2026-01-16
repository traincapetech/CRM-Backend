const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Set default MongoDB connection string if not in env
if (!process.env.MONGO_URI) {
  console.log('MongoDB connection string not found in .env, using default local connection');
  process.env.MONGO_URI = 'mongodb://localhost:27017/crm';
}

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

// Function to drop unique indexes from Lead collection
async function dropUniqueIndexes() {
  try {
    // Connect to the database
    await connectDB();
    
    console.log('Connected to MongoDB, checking for unique indexes...');
    
    // Get the Lead collection
    const db = mongoose.connection.db;
    const Lead = db.collection('leads');
    
    // Get all indexes on the Lead collection
    const indexes = await Lead.indexes();
    console.log('Current indexes:', indexes);
    
    // Find and drop any unique indexes on email or phone
    for (const index of indexes) {
      // Check if this is a unique index on email or phone
      if (index.unique === true) {
        if (index.key.email || index.key.phone) {
          const fieldName = index.key.email ? 'email' : 'phone';
          console.log(`Found unique index on ${fieldName} field: ${index.name}`);
          
          // Drop the unique index
          await Lead.dropIndex(index.name);
          console.log(`Successfully dropped unique index: ${index.name}`);
        }
      }
    }
    
    // Verify indexes after dropping
    const remainingIndexes = await Lead.indexes();
    console.log('Remaining indexes after cleanup:', remainingIndexes);
    
    console.log('Index cleanup completed successfully');
  } catch (error) {
    console.error('Error dropping unique indexes:', error);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the function
dropUniqueIndexes(); 