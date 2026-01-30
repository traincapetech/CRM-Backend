const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Load models
    require('./models/Department');
    require('./models/EmployeeRole');
    const Employee = require('./models/Employee');
    
    // List all employees
    const allEmps = await Employee.find().select('fullName email status department').populate('department', 'name');
    console.log('\n=== ALL EMPLOYEES IN DATABASE ===');
    allEmps.forEach((emp, i) => {
      console.log(`${i+1}. ${emp.fullName} (${emp.email}) - Status: ${emp.status} - Dept: ${emp.department?.name || 'N/A'}`);
    });
    console.log('\nTotal:', allEmps.length);
    
    // Check specifically for Eshita
    const eshita = allEmps.find(e => e.email === 'eshita@traincapetech.in');
    console.log('\n=== ESHITA CHECK ===');
    console.log('Found:', eshita ? 'YES' : 'NO');
    if (eshita) {
      console.log('ID:', eshita._id);
      console.log('Status:', eshita.status);
    }
    
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}
check();
