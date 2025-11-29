const mongoose = require('mongoose');
const Department = require('../models/Department');
require('dotenv').config();

const addITDepartment = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database');

    // Check if IT department exists
    const existingDept = await Department.findOne({ name: 'IT' });
    if (!existingDept) {
      const itDepartment = await Department.create({
        name: 'IT',
        description: 'Information Technology department responsible for technical development and support'
      });
      console.log('Created IT department:', itDepartment);
    } else {
      console.log('IT department already exists');
    }

    await mongoose.disconnect();
    console.log('Disconnected from database');
  } catch (error) {
    console.error('Error setting up IT department:', error);
    await mongoose.disconnect();
  }
};

addITDepartment();
