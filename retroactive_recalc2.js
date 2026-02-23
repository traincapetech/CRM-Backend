require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const PerformanceCalculationService = require("./services/performanceCalculation");
const DailyPerformanceRecord = require("./models/DailyPerformanceRecord");

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("Connected to DB");
    
    const eligibleEmployees = await User.find({
      active: true,
      role: { $in: ["Lead Person", "Sales Person", "Manager"] },
    });
    
    console.log(`Doing retroactive recalc for ${eligibleEmployees.length} employees for the last 30 days...`);
    
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    for (const emp of eligibleEmployees) {
      // Wipe their daily records from the last 30 days so we rewrite them fresh
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      await DailyPerformanceRecord.deleteMany({
        employeeId: emp._id,
        date: { $gte: thirtyDaysAgo }
      });

      // Loop over the last 30 days
      for (let i = 29; i >= 0; i--) {
        const recalcDate = new Date();
        recalcDate.setDate(today.getDate() - i);
        // Avoid calculating future dates if the script runs mid-day
        if (recalcDate > new Date()) continue;
        
        await PerformanceCalculationService.calculateEmployeePerformance(emp._id, recalcDate);
      }
      
      // Finally, force an update to the summary
      await PerformanceCalculationService.updatePerformanceSummary(emp._id);
    }
    
    console.log("Recalculation complete. Averages should be fixed now.");
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
