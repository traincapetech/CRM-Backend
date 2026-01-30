const mongoose = require('mongoose');
require('dotenv').config();

async function generatePayroll() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Load models
    require('./models/User');
    require('./models/Department');
    require('./models/EmployeeRole');
    const Employee = require('./models/Employee');
    const Payroll = require('./models/Payroll');
    
    // Get Eshita's employee details
    const eshita = await Employee.findById('687e08444748d76576d153a3');
    if (!eshita) {
      console.log('ERROR: Employee not found!');
      process.exit(1);
    }
    
    console.log('\n=== EMPLOYEE DETAILS ===');
    console.log('Name:', eshita.fullName);
    console.log('Email:', eshita.email);
    console.log('Salary:', eshita.salary);
    console.log('User ID:', eshita.userId);
    
    if (!eshita.userId) {
      console.log('ERROR: Employee does not have an associated userId!');
      process.exit(1);
    }
    
    // Check if January 2026 payroll already exists
    const existing = await Payroll.findOne({
      employeeId: eshita._id,
      month: 1,
      year: 2026
    });
    
    if (existing) {
      console.log('\nPayroll already exists for January 2026!');
      console.log('ID:', existing._id);
      process.exit(0);
    }
    
    // Create January 2026 payroll
    const payrollData = {
      employeeId: eshita._id,
      userId: eshita.userId,
      month: 1,
      year: 2026,
      baseSalary: eshita.salary || 17000,
      workingDays: 30,
      daysPresent: 30, // Will need to be updated based on attendance
      calculatedSalary: eshita.salary || 17000,
      status: 'DRAFT',
      notes: 'Auto-generated payroll for January 2026'
    };
    
    console.log('\n=== CREATING PAYROLL ===');
    console.log('Data:', JSON.stringify(payrollData, null, 2));
    
    const payroll = await Payroll.create(payrollData);
    
    console.log('\n✅ PAYROLL CREATED SUCCESSFULLY!');
    console.log('Payroll ID:', payroll._id);
    console.log('Month:', payroll.month + '/' + payroll.year);
    console.log('Base Salary:', payroll.baseSalary);
    console.log('Net Salary:', payroll.netSalary);
    console.log('Status:', payroll.status);
    
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
generatePayroll();
