const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load env vars
dotenv.config({ path: path.join(__dirname, "../.env") });

const User = require("../models/User");
const PerformanceCalculationService = require("../services/performanceCalculation");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const recalculate = async () => {
  await connectDB();
  const userId = "681dd5c66b0bcf54078dac15"; // Shivam Singh
  console.log(`Recalculating for user: ${userId}`);

  await PerformanceCalculationService.calculateEmployeePerformance(
    userId,
    new Date(),
  );
  console.log("✅ Recalculation complete.");
  process.exit();
};

recalculate();
