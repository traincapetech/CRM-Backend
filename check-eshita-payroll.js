const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Load models
    require('./models/User');
    require('./models/Department');
    require('./models/EmployeeRole');
    require('./models/Employee');
    const Payroll = require('./models/Payroll');
    
    // Find ALL payroll records for Eshita by employee ID
    const payrolls = await Payroll.find({employee: '687e08444748d76576d153a3'});
    console.log('\n=== PAYROLL RECORDS FOR ESHITA (by employee ID) ===');
    console.log('Count:', payrolls.length);
    payrolls.forEach((p, i) => {
      console.log(`${i+1}. Month: ${p.month}/${p.year} - Status: ${p.status} - Net: ${p.netSalary}`);
    });
    
    // Also check payroll schema to understand the structure
    console.log('\n=== PAYROLL FOR JAN 2026 (all employees) ===');
    const jan2026 = await Payroll.find({month: 1, year: 2026}).populate('employee', 'fullName email');
    console.log('Count:', jan2026.length);
    jan2026.forEach((p, i) => {
      console.log(`${i+1}. ${p.employee?.fullName || 'Unknown'} (${p.employee?.email}) - Status: ${p.status}`);
    });
    
    console.log('\n=== PAYROLL FOR DEC 2025 (all employees) ===');
    const dec2025 = await Payroll.find({month: 12, year: 2025}).populate('employee', 'fullName email');
    console.log('Count:', dec2025.length);
    dec2025.forEach((p, i) => {
      console.log(`${i+1}. ${p.employee?.fullName || 'Unknown'} (${p.employee?.email}) - Status: ${p.status}`);
    });
    
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
check();
