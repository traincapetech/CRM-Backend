const mongoose = require('mongoose');
require('dotenv').config();

async function verify() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    require('./models/User');
    require('./models/Department');
    require('./models/EmployeeRole');
    const Employee = require('./models/Employee');
    const Payroll = require('./models/Payroll');
    
    // Get Eshita's January 2026 payroll
    const payroll = await Payroll.findById('697c6815cee3e642d3ee83f4');
    console.log('\n=== ESHITA JANUARY 2026 PAYROLL ===');
    console.log(JSON.stringify(payroll, null, 2));
    
    // Also list ALL Jan 2026 payrolls including Eshita now
    console.log('\n=== ALL JAN 2026 PAYROLL RECORDS (After verification) ===');
    const jan2026 = await Payroll.find({month: 1, year: 2026});
    console.log('Total count:', jan2026.length);
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
verify();
