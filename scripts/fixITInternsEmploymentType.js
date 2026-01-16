/**
 * Migration script to fix employmentType for existing IT Intern employees
 * This ensures that all IT Interns have employmentType = 'INTERN' in the database
 */

const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const EmployeeRole = require('../models/EmployeeRole');

// Load environment variables
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fixITInterns = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/crm';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find all IT Intern role
    const itInternRole = await EmployeeRole.findOne({ name: 'IT Intern' });
    
    if (!itInternRole) {
      console.log('⚠️  IT Intern role not found. Creating it...');
      const newRole = await EmployeeRole.create({
        name: 'IT Intern',
        description: 'Role for IT Interns'
      });
      console.log('✅ Created IT Intern role');
    }

    // Find all employees with IT Intern role but wrong/missing employmentType
    const employeesToFix = await Employee.find({
      role: itInternRole._id,
      $or: [
        { employmentType: { $ne: 'INTERN' } },
        { employmentType: { $exists: false } }
      ]
    }).populate('role');

    console.log(`\n📋 Found ${employeesToFix.length} IT Intern employees to fix:`);
    employeesToFix.forEach(emp => {
      console.log(`  - ${emp.fullName} (${emp.email}): Current employmentType = ${emp.employmentType || 'NOT SET'}`);
    });

    // Update all IT Interns to have employmentType = 'INTERN'
    const updateResult = await Employee.updateMany(
      {
        role: itInternRole._id,
        $or: [
          { employmentType: { $ne: 'INTERN' } },
          { employmentType: { $exists: false } }
        ]
      },
      {
        $set: { employmentType: 'INTERN' }
      }
    );

    console.log(`\n✅ Updated ${updateResult.modifiedCount} employee records`);
    console.log(`📊 Total matched: ${updateResult.matchedCount}`);

    // Also fix employees where role name contains "IT Intern" (backwards compatibility)
    const allEmployees = await Employee.find({}).populate('role');
    let fixedByRoleName = 0;
    
    for (const emp of allEmployees) {
      const roleName = emp.role?.name || '';
      if (roleName.includes('IT Intern') && emp.employmentType !== 'INTERN') {
        await Employee.findByIdAndUpdate(emp._id, { employmentType: 'INTERN' });
        fixedByRoleName++;
        console.log(`  ✅ Fixed ${emp.fullName} by role name`);
      }
    }

    if (fixedByRoleName > 0) {
      console.log(`\n✅ Fixed ${fixedByRoleName} additional employees by role name check`);
    }

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  }
};

// Run the migration
fixITInterns();

