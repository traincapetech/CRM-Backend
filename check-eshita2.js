const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Load models in correct order
    require('./models/Department');
    require('./models/EmployeeRole');
    const Employee = require('./models/Employee');
    
    // Check by email
    const emp = await Employee.findOne({email: 'eshita@traincapetech.in'}).populate('department', 'name').populate('role', 'name');
    console.log('\n=== Employee by email eshita@traincapetech.in ===');
    if (emp) {
      console.log(JSON.stringify({
        _id: emp._id,
        fullName: emp.fullName,
        email: emp.email,
        status: emp.status,
        department: emp.department,
        role: emp.role
      }, null, 2));
    } else {
      console.log('NOT FOUND');
    }
    
    // Count all employees
    const count = await Employee.countDocuments();
    console.log('\nTotal employees in DB:', count);
    
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
check();
