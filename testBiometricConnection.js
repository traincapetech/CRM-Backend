require("dotenv").config(); // Loads .env from current dir by default
const mongoose = require("mongoose");
const axios = require("axios");
const BiometricSettings = require("./models/BiometricSettings");

const testConnection = async () => {
  try {
    console.log("Connecting to MongoDB...");
    if (!process.env.MONGO_URI) {
      console.error("MONGO_URI is missing from environment");
      return;
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const settings = await BiometricSettings.findOne();
    if (!settings) {
      console.log("No BiometricSettings found in DB.");
      return;
    }

    console.log("Settings found:", {
      apiUrl: settings.apiBaseUrl,
      hasApiKey: !!settings.apiKey,
      lastSync: settings.lastSyncAt,
    });

    if (!settings.apiBaseUrl) {
      console.error("API Base URL is missing.");
      return;
    }

    const params = {
      from_date: "2026-01-24",
      page: 1,
      limit: 10,
    };

    const headers = {
      "Content-Type": "application/json",
    };
    if (settings.apiKey) {
      headers["Authorization"] = `Bearer ${settings.apiKey}`;
    }

    console.log("Making request to vendor API...");
    try {
      const response = await axios.get(settings.apiBaseUrl, {
        params,
        headers,
        timeout: 15000,
      });

      console.log("Response Status:", response.status);

      let dataToLog = response.data;
      if (typeof dataToLog === "string") {
        try {
          dataToLog = JSON.parse(dataToLog);
          console.log("Response is a string, parsed to JSON.");
        } catch (e) {
          console.log("Response is a string, could not parse as JSON.");
        }
      }

      console.log("Response Data Type:", typeof dataToLog);

      if (dataToLog && typeof dataToLog === "object") {
        console.log("Response Keys:", Object.keys(dataToLog));

        if (Array.isArray(dataToLog)) {
          console.log("Is Array: Yes, length:", dataToLog.length);
          if (dataToLog.length > 0) {
            console.log("Sample Item:", JSON.stringify(dataToLog[0], null, 2));
          }
        } else {
          console.log("Is Array: No");
          // Check for nested arrays
          ["logs", "data", "events", "attendance"].forEach((key) => {
            if (Array.isArray(dataToLog[key])) {
              console.log(
                `Found array in key '${key}', length:`,
                dataToLog[key].length,
              );
              if (dataToLog[key].length > 0) {
                console.log(
                  `Sample Item from '${key}':`,
                  JSON.stringify(dataToLog[key][0], null, 2),
                );
              }
            }
          });
          if (Object.keys(dataToLog).length < 20) {
            console.log("Data sample:", JSON.stringify(dataToLog, null, 2));
          }
        }
      } else {
        console.log("Response Data:", dataToLog);
      }
    } catch (err) {
      console.error("API Request Failed:", err.message);
      if (err.response) {
        console.error("Status:", err.response.status);
        console.error("Data:", JSON.stringify(err.response.data, null, 2));
      }
    }
  } catch (error) {
    console.error("Script Error:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

testConnection();
