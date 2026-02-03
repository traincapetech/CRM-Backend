const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load env vars
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const Employee = require("../models/Employee");

const cleanBiometricCodes = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to database to clean up biometric codes...");

    // Find employees with biometricCode set to null
    const employeesWithNull = await Employee.find({ biometricCode: null });
    console.log(
      `Found ${employeesWithNull.length} employees with biometricCode: null`,
    );

    if (employeesWithNull.length > 0) {
      // Unset the biometricCode field for these employees
      const result = await Employee.updateMany(
        { biometricCode: null },
        { $unset: { biometricCode: "" } },
      );
      console.log(`Successfully cleaned up ${result.modifiedCount} documents.`);
    }

    process.exit(0);
  } catch (err) {
    console.error("Error cleaning up biometric codes:", err);
    process.exit(1);
  }
};

cleanBiometricCodes();
