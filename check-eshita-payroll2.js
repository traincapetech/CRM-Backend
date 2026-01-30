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
    
    // Find ALL payroll records for Eshita by employeeId (correct field name!)
    const payrolls = await Payroll.find({employeeId: '687e08444748d76576d153a3'}).sort({year: -1, month: -1});
    console.log('\n=== PAYROLL RECORDS FOR ESHITA (by employeeId) ===');
    console.log('Count:', payrolls.length);
    payrolls.forEach((p, i) => {
      console.log(`${i+1}. Month: ${p.month}/${p.year} - Status: ${p.status} - Base: ₹${p.baseSalary} - Net: ₹${p.netSalary}`);
    });
    
    // Check for all payroll records in Jan 2026
    console.log('\n=== PAYROLL FOR JAN 2026 (all employees) ===');
    const jan2026 = await Payroll.find({month: 1, year: 2026});
    console.log('Count:', jan2026.length);
    
    // Check for all payroll records in Dec 2025
    console.log('\n=== PAYROLL FOR DEC 2025 (all employees) ===');
    const dec2025 = await Payroll.find({month: 12, year: 2025});
    console.log('Count:', dec2025.length);
    
    // List Dec 2025 records with employee details
    for (const p of dec2025) {
      const Employee = require('./models/Employee');
      const emp = await Employee.findById(p.employeeId).select('fullName email');
      console.log(`- ${emp?.fullName || 'Unknown'} (${emp?.email}) - Status: ${p.status} - Net: ₹${p.netSalary}`);
    }
    
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
check();
