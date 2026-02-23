require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const PerformanceCalculationService = require("./services/performanceCalculation");

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("Connected to DB");
    const eligibleEmployees = await User.find({
      active: true,
      role: { $in: ["Lead Person", "Sales Person", "Manager"] },
    });

    console.log(
      `Triggering recalculation for ${eligibleEmployees.length} employees to generate PIP reasons...`,
    );
    const today = new Date();

    for (const emp of eligibleEmployees) {
      console.log(`Processing: ${emp.fullName}`);
      await PerformanceCalculationService.calculateEmployeePerformance(
        emp._id,
        today,
      );
      await PerformanceCalculationService.updatePerformanceSummary(emp._id);
    }

    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
