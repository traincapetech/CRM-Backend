const mongoose = require('mongoose');
const Department = require('../models/Department');
const Role = require('../models/EmployeeRole');

// Load env vars
require('dotenv').config({ path: './.env' });

// Connect to database
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const seedData = async () => {
  try {
    // Clear existing data
    await Department.deleteMany({});
    await Role.deleteMany({});
    
    // Seed departments
    const departments = [
      {
        name: 'Sales',
        description: 'Sales and Business Development Department'
      },
      {
        name: 'HR',
        description: 'Human Resources Department'
      },
      {
        name: 'IT',
        description: 'Information Technology Department'
      },
      {
        name: 'Marketing',
        description: 'Marketing and Digital Marketing Department'
      },
      {
        name: 'Finance',
        description: 'Finance and Accounting Department'
      },
      {
        name: 'Operations',
        description: 'Operations and Support Department'
      },
      {
        name: 'General',
        description: 'General Department for all employees'
      }
    ];
    
    const createdDepartments = await Department.insertMany(departments);
    console.log(`✅ Seeded ${createdDepartments.length} departments`);
    
    // Seed roles
    const roles = [
      {
        name: 'Sales Person',
        description: 'Sales Executive responsible for customer acquisition'
      },
      {
        name: 'Lead Person',
        description: 'Lead Generation Specialist'
      },
      {
        name: 'Manager',
        description: 'Department Manager'
      },
      {
        name: 'Admin',
        description: 'System Administrator'
      },
      {
        name: 'HR',
        description: 'Human Resources Executive'
      },
      {
        name: 'HR Executive',
        description: 'Human Resources Executive'
      },
      {
        name: 'International Sales Executive',
        description: 'International Sales Executive'
      },
      {
        name: 'Lead Executive',
        description: 'Lead Generation Executive'
      },
      {
        name: 'Marketing Executive',
        description: 'Marketing and Promotion Executive'
      },
      {
        name: 'IT Support',
        description: 'Information Technology Support'
      },
      {
        name: 'Finance Executive',
        description: 'Finance and Accounting Executive'
      },
      {
        name: 'Operations Executive',
        description: 'Operations and Support Executive'
      },
      {
        name: 'Employee',
        description: 'General Employee'
      }
    ];
    
    const createdRoles = await Role.insertMany(roles);
    console.log(`✅ Seeded ${createdRoles.length} roles`);
    
    console.log('✅ Database seeded successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

seedData(); 