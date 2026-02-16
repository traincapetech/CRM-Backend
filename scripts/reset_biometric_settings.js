const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const BiometricSettings = require("../models/BiometricSettings");
const Employee = require("../models/Employee");
const Department = require("../models/Department");
const EmployeeRole = require("../models/EmployeeRole");

// Load env vars
dotenv.config({ path: path.join(__dirname, "../.env") });

const resetSettings = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // 1. Clear Webhook Secret
    const settings = await BiometricSettings.findOne();
    if (settings) {
      settings.webhookSecret = "";
      await settings.save();
      console.log("✅ Webhook secret cleared.");
    } else {
      console.log("⚠️ No BiometricSettings found to update.");
    }

    // 2. Fetch dependencies
    const department = await Department.findOne();
    if (!department) throw new Error("No departments found");

    const role = await EmployeeRole.findOne();
    if (!role) throw new Error("No roles found");

    console.log(`Using Department: ${department.name} (${department._id})`);
    console.log(`Using Role: ${role.name} (${role._id})`);

    // 3. Create/Update Test Employee 3905
    let emp = await Employee.findOne({ biometricCode: "3905" });
    if (!emp) {
      emp = await Employee.create({
        fullName: "Biometric Test User",
        email: "test.biometric@traincapetech.in",
        department: department._id,
        role: role._id,
        phoneNumber: "9999999999",
        dateOfJoining: new Date(),
        biometricCode: "3905",
        biometricEnabled: true,
        basicSalary: 10000,
        status: "ACTIVE",
      });
      console.log(
        "✅ Created test employee 'Biometric Test User' with code 3905",
      );
    } else {
      console.log("ℹ️ Employee 3905 already exists.");
    }

    // 4. Also create Employee 00003905 just in case
    let empPadded = await Employee.findOne({ biometricCode: "00003905" });
    if (!empPadded) {
      // We can't have duplicate email, so use a different one
      empPadded = await Employee.create({
        fullName: "Biometric Test User Padded",
        email: "test.biometric.padded@traincapetech.in",
        department: department._id,
        role: role._id,
        phoneNumber: "8888888888",
        dateOfJoining: new Date(),
        biometricCode: "00003905",
        biometricEnabled: true,
        basicSalary: 10000,
        status: "ACTIVE",
      });
      console.log(
        "✅ Created test employee 'Biometric Test User Padded' with code 00003905",
      );
    } else {
      console.log("ℹ️ Employee 00003905 already exists.");
    }

    // 5. Create Employee 3914 for recent webhook test
    let emp3914 = await Employee.findOne({ biometricCode: "3914" });
    if (!emp3914) {
      emp3914 = await Employee.create({
        fullName: "Biometric Test User 3914",
        email: "test.biometric.3914@traincapetech.in",
        department: department._id,
        role: role._id,
        phoneNumber: "7777777777",
        dateOfJoining: new Date(),
        biometricCode: "3914",
        biometricEnabled: true,
        basicSalary: 10000,
        status: "ACTIVE",
      });
      console.log(
        "✅ Created test employee 'Biometric Test User 3914' with code 3914",
      );
    } else {
      console.log("ℹ️ Employee 3914 already exists.");
    }

    process.exit();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
};

resetSettings();
