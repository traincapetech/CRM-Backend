const mongoose = require('mongoose');
require('dotenv').config();
require('../models/Department');
require('../models/EmployeeRole');
const User = require('../models/User');
const Employee = require('../models/Employee');

async function linkUserEmployee() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database');

    const user = await User.findOne({ email: 'jaspreet@gmail.com' });
    if (!user) {
      console.log('User not found');
      return;
    }
    console.log('Found user:', {
      id: user._id,
      name: user.fullName,
      email: user.email,
      role: user.role
    });

    const employee = await Employee.findOne({ email: 'jaspreet@gmail.com' });
    if (!employee) {
      console.log('Employee not found');
      return;
    }
    console.log('Found employee:', {
      id: employee._id,
      name: employee.fullName,
      email: employee.email
    });

    // Link records
    employee.userId = user._id;
    await employee.save();
    console.log('Updated employee with userId');

    user.employeeId = employee._id;
    await user.save();
    console.log('Updated user with employeeId');

    console.log('Successfully linked records');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
  }
}

linkUserEmployee();
