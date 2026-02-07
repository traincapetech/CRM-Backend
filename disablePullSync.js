require("dotenv").config();
const mongoose = require("mongoose");
const BiometricSettings = require("./models/BiometricSettings");

const disablePullSync = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.error("MONGO_URI is missing");
      return;
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    let settings = await BiometricSettings.findOne();
    if (settings) {
      // Clear API URL to disable pull sync loop
      // But keep enabled=true for Webhook to work
      settings.apiBaseUrl = "";

      // Push integration doesn't need API Key effectively if only secret is used for validation
      // But we'll leave apiKey if it was set for push token, though usually push token is in header

      await settings.save();
      console.log(
        "Biometric Settings Updated: Pull Sync Disabled (apiBaseUrl cleared). Webhook remains enabled.",
      );
      console.log(settings);
    } else {
      console.log("No settings found to update.");
    }
  } catch (error) {
    console.error("Error updating settings:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

disablePullSync();
