require("dotenv").config();
const mongoose = require("mongoose");
const BiometricSettings = require("./models/BiometricSettings");

const configureSettings = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.error("MONGO_URI is missing");
      return;
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    let settings = await BiometricSettings.findOne();
    if (!settings) {
      settings = new BiometricSettings();
    }

    // Configure based on screenshot
    settings.enabled = true;
    settings.webhookSecret = "traincape-rtm-2026";
    settings.vendorName = "Realtime Biometrics";
    // URL for pull sync is different, but for Push we just need the secret and enabled.
    // The user was trying to PULL earlier, but now seems to want PUSH.
    // We can leave other settings as is or set defaults.

    await settings.save();
    console.log("Biometric Settings Updated:", settings);
  } catch (error) {
    console.error("Error configuring settings:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

configureSettings();
