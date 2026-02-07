require("dotenv").config();
const mongoose = require("mongoose");
const BiometricLog = require("./models/BiometricLog");

const checkRecentLogs = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Check for any logs created in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const logs = await BiometricLog.find({
      createdAt: { $gte: oneHourAgo },
    })
      .sort({ createdAt: -1 })
      .limit(20);

    console.log(
      `\nNew logs received in last hour (${oneHourAgo.toISOString()} onwards): Found ${logs.length}`,
    );

    logs.forEach((log) => {
      console.log(
        `- Time: ${log.eventTime}, Code: ${log.biometricCode}, Employee: ${log.employeeId}, CreatedAt: ${log.createdAt}`,
      );
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

checkRecentLogs();
