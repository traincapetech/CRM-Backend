const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Load models
    require('./models/Department');
    require('./models/EmployeeRole');
    require('./models/Employee');
    const Payroll = require('./models/Payroll');
    
    // Check for payroll records for this employee
    const payroll = await Payroll.find({employee: '687e08444748d76576d153a3'});
    console.log('\n=== Payroll records for employee 687e08444748d76576d153a3 ===');
    console.log('Count:', payroll.length);
    if (payroll.length > 0) {
      console.log('Records:', JSON.stringify(payroll.slice(0, 3), null, 2));
    }
    
    // Check by email
    const payrollByEmail = await Payroll.find().populate('employee');
    const eshitaPayroll = payrollByEmail.filter(p => p.employee?.email === 'eshita@traincapetech.in');
    console.log('\n=== Payroll by email search ===');
    console.log('Count:', eshitaPayroll.length);
    
    // Total payroll records
    const total = await Payroll.countDocuments();
    console.log('\nTotal payroll records:', total);
    
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
check();
