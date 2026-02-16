const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load env vars
dotenv.config({ path: path.join(__dirname, "../.env") });

// Register models
require("../models/Department");
require("../models/EmployeeRole");
require("../models/User");
const Employee = require("../models/Employee");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const checkEmployee = async () => {
  await connectDB();
  const codes = ["00000014"];

  for (const code of codes) {
    const emp = await Employee.findOne({ biometricCode: code });
    if (emp) {
      console.log(
        `✅ Employee found for code '${code}': ${emp.fullName} (${emp.email})`,
      );
    } else {
      console.log(`⚠️ NO Employee found for code '${code}'`);
    }
  }
  process.exit();
};

checkEmployee();
