const mongoose = require('mongoose');
const EmployeeRole = require('../models/EmployeeRole');
require('dotenv').config();

const addITRoles = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database');

    // Define IT roles
    const itRoles = [
      {
        name: 'IT Staff',
        description: 'IT department staff member responsible for technical development and support'
      },
      {
        name: 'IT Manager',
        description: 'IT department manager overseeing technical projects and team members'
      }
    ];

    // Add each role if it doesn't exist
    for (const role of itRoles) {
      const existingRole = await EmployeeRole.findOne({ name: role.name });
      if (!existingRole) {
        await EmployeeRole.create(role);
        console.log(`Created role: ${role.name}`);
      } else {
        console.log(`Role already exists: ${role.name}`);
      }
    }

    console.log('IT roles setup completed');
    await mongoose.disconnect();
    console.log('Disconnected from database');
  } catch (error) {
    console.error('Error setting up IT roles:', error);
    await mongoose.disconnect();
  }
};

addITRoles();
