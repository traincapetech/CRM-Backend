const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    require('./models/User');
    require('./models/Department');
    require('./models/EmployeeRole');
    const Employee = require('./models/Employee');
    
    // Get all employees (simulating what the API returns)
    const employees = await Employee.find()
      .populate('role', 'name description')
      .populate('department', 'name description')
      .sort('-createdAt');
    
    console.log('\n=== ALL EMPLOYEES (As returned by API) ===');
    console.log('Total count:', employees.length);
    
    // Check if Eshita is in this list
    const eshita = employees.find(e => e.email === 'eshita@traincapetech.in');
    console.log('\n=== ESHITA IN LIST? ===');
    console.log('Found:', eshita ? 'YES' : 'NO');
    if (eshita) {
      console.log('ID:', eshita._id);
      console.log('Full Name:', eshita.fullName);
      console.log('Status:', eshita.status);
      console.log('Position in list:', employees.findIndex(e => e.email === 'eshita@traincapetech.in') + 1);
    }
    
    // List first 15 employees to show the order
    console.log('\n=== FIRST 15 EMPLOYEES ===');
    employees.slice(0, 15).forEach((e, i) => {
      console.log(`${i+1}. ${e.fullName} (${e.email}) - Status: ${e.status}`);
    });
    
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
check();
