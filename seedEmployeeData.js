const mongoose = require('mongoose');
const Department = require('./models/Department');
const Role = require('./models/EmployeeRole');
require('dotenv').config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/crm');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

const seedData = async () => {
  try {
    await connectDB();

    // Clear existing data
    await Department.deleteMany({});
    await Role.deleteMany({});

    // Create departments
    const departments = [
      {
        name: 'Sales',
        description: 'Sales and business development team'
      },
      {
        name: 'IT',
        description: 'Information Technology department'
      },
      {
        name: 'Marketing',
        description: 'Marketing and promotion team'
      },
      {
        name: 'HR',
        description: 'Human Resources department'
      },
      {
        name: 'Finance',
        description: 'Finance and accounting team'
      }
    ];

    const createdDepartments = await Department.insertMany(departments);
    console.log('✅ Departments created:', createdDepartments.length);

    // Create roles
    const roles = [
      {
        name: 'Lead Executive',
        description: 'Lead generation and management'
      },
      {
        name: 'International Sales Executive',
        description: 'International sales and client management'
      },
      {
        name: 'IT Specialist',
        description: 'Technical support and development'
      },
      {
        name: 'Intern',
        description: 'Internship position'
      },
      {
        name: 'Manager',
        description: 'Team management and supervision'
      },
      {
        name: 'HR Executive',
        description: 'Human resources management'
      },
      {
        name: 'Marketing Executive',
        description: 'Marketing campaigns and strategies'
      }
    ];

    const createdRoles = await Role.insertMany(roles);
    console.log('✅ Roles created:', createdRoles.length);

    console.log('\n🎉 Employee data seeding completed successfully!');
    console.log('\nCreated Departments:');
    createdDepartments.forEach(dept => {
      console.log(`- ${dept.name}: ${dept.description}`);
    });

    console.log('\nCreated Roles:');
    createdRoles.forEach(role => {
      console.log(`- ${role.name}: ${role.description}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
};

seedData(); 