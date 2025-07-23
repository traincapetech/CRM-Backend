const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Use live database connection
    const DB_URI = process.env.DB_URI || 'mongodb+srv://traincape:parichay@traincapetechnology.1p6rbwq.mongodb.net/CRM?retryWrites=true&w=majority&appName=TraincapeTechnology';
    
    console.log('Environment variables:', {
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET: process.env.JWT_SECRET ? 'Set' : 'Not set',
      JWT_EXPIRE: process.env.JWT_EXPIRE,
      DB_URI: DB_URI.includes('mongodb+srv') ? 'Live MongoDB Atlas' : DB_URI
    });

    const conn = await mongoose.connect(DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

module.exports = connectDB; 