const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const Employee = require('./models/Employee');
    
    // Check by ID mentioned
    const emp1 = await Employee.findById('681b5e28122917beb814fbfa');
    console.log('\n=== Employee by ID 681b5e28122917beb814fbfa ===');
    console.log(emp1 ? JSON.stringify({_id: emp1._id, fullName: emp1.fullName, email: emp1.email, status: emp1.status, department: emp1.department, role: emp1.role}, null, 2) : 'NOT FOUND');
    
    // Check by email
    const emp2 = await Employee.findOne({email: 'eshita@traincapetech.in'});
    console.log('\n=== Employee by email eshita@traincapetech.in ===');
    console.log(emp2 ? JSON.stringify({_id: emp2._id, fullName: emp2.fullName, email: emp2.email, status: emp2.status, department: emp2.department, role: emp2.role}, null, 2) : 'NOT FOUND');
    
    // Count all employees
    const count = await Employee.countDocuments();
    console.log('\nTotal employees in DB:', count);
    
    // List first 5 employees
    const allEmps = await Employee.find().limit(10).select('fullName email status');
    console.log('\nFirst 10 employees:', JSON.stringify(allEmps, null, 2));
    
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}
check();
