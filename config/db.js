const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI environment variable is required');
    }
    const Mongo_URI = process.env.MONGO_URI;
    
    console.log('Environment variables:', {
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET: process.env.JWT_SECRET ? 'Set' : 'Not set',
      JWT_EXPIRE: process.env.JWT_EXPIRE,
      Mongo_URI: Mongo_URI.includes('mongodb+srv') ? 'Live MongoDB Atlas' : Mongo_URI
    });

    const conn = await mongoose.connect(Mongo_URI, {
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