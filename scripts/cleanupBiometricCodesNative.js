const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load env vars
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const cleanBiometricCodes = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(
      "Connected to database (native) to clean up biometric codes...",
    );

    const db = mongoose.connection.db;
    const employeesCollection = db.collection("employees");

    // Find documents with biometricCode strictly set to null
    const count = await employeesCollection.countDocuments({
      biometricCode: null,
    });
    console.log(`Found ${count} documents with biometricCode: null`);

    if (count > 0) {
      const result = await employeesCollection.updateMany(
        { biometricCode: null },
        { $unset: { biometricCode: "" } },
      );
      console.log(
        `Successfully unset biometricCode for ${result.modifiedCount} documents.`,
      );
    } else {
      console.log(
        "No documents found with biometricCode: null. The index should be clean.",
      );
    }

    process.exit(0);
  } catch (err) {
    console.error("Error during native cleanup:", err);
    process.exit(1);
  }
};

cleanBiometricCodes();
