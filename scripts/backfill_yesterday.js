const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const User = require("../models/User");
const PerformanceCalculationService = require("../services/performanceCalculation");

// Connect to Database
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => {
    console.error("MongoDB Connection Error:", err);
    process.exit(1);
  });

const backfillYesterday = async () => {
  try {
    // 1. Calculate Yesterday's Date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    console.log(
      `📅 Backfilling performance for date: ${yesterday.toDateString()}`,
    );

    // 2. Find All Relevant Employees
    // We want Lead Persons and Sales Persons primarily
    const employees = await User.find({
      role: { $in: ["Lead Person", "Sales Person", "Manager", "Employee"] },
      active: true,
    });

    console.log(`👥 Found ${employees.length} active employees to process.`);

    // 3. Trigger Calculation for Each
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const emp of employees) {
      try {
        console.log(`Processing ${emp.fullName} (${emp.role})...`);
        const result =
          await PerformanceCalculationService.calculateEmployeePerformance(
            emp._id,
            yesterday,
          );

        if (result && result.overallScore !== undefined) {
          console.log(
            `✅ Updated ${emp.fullName}: Score ${Math.round(result.overallScore)}`,
          );
          successCount++;
        } else {
          console.log(
            `⚠️  Skipped ${emp.fullName}: No KPIs or result returned.`,
          );
          skippedCount++;
        }
      } catch (err) {
        console.error(`❌ Failed to update ${emp.fullName}:`, err.message);
        errorCount++;
      }
    }

    console.log("\n=================================");
    console.log(`🎉 Backfill Complete!`);
    console.log(`Success: ${successCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log("=================================\n");

    process.exit(0);
  } catch (error) {
    console.error("Script Error:", error);
    process.exit(1);
  }
};

backfillYesterday();
