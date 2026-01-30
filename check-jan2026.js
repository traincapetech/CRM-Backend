const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    require('./models/User');
    require('./models/Department');
    require('./models/EmployeeRole');
    require('./models/Employee');
    const Payroll = require('./models/Payroll');
    const Employee = require('./models/Employee');
    
    // Check ESHITA specifically for Jan 2026
    const eshitaJan = await Payroll.findOne({employeeId: '687e08444748d76576d153a3', month: 1, year: 2026});
    console.log('\n=== ESHITA JAN 2026 PAYROLL ===');
    console.log('Exists:', eshitaJan ? 'YES' : 'NO');
    if (eshitaJan) {
      console.log('Details:', JSON.stringify(eshitaJan, null, 2));
    }
    
    // List all Jan 2026 payroll with employee names
    console.log('\n=== ALL JAN 2026 PAYROLL RECORDS ===');
    const jan2026 = await Payroll.find({month: 1, year: 2026});
    for (const p of jan2026) {
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
