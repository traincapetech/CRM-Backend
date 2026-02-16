const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load env vars
dotenv.config({ path: path.join(__dirname, "../.env") });

const User = require("../models/User");
const Sale = require("../models/Sale");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const debugUserSales = async (userId) => {
  try {
    console.log(`\n🔍 Debugging Sales for User: ${userId}`);

    // Check ALL Sales for user
    const allSales = await Sale.find({ salesPerson: userId });
    console.log(`\n💰 TOTAL Sales found in DB for user: ${allSales.length}`);

    allSales.forEach((s) => {
      console.log(
        `   - Date: ${s.date ? s.date.toISOString().split("T")[0] : "N/A"}, Amount: ${s.totalCost}, Status: '${s.status}'`,
      );
    });
  } catch (err) {
    console.error(err);
  }
};

const run = async () => {
  await connectDB();
  // User ID provided by user: Shivam Singh
  await debugUserSales("681dd5c66b0bcf54078dac15");
  process.exit();
};

run();
