const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Branch = require("../models/Branch");
const User = require("../models/User");

async function seedBranches() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error("❌ MONGO_URI missing in environment.");
      process.exit(1);
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected.");

    const admin = await User.findOne({ role: "Admin" });
    if (!admin) {
      console.error("❌ No Admin user found for createdBy reference.");
      await mongoose.disconnect();
      process.exit(1);
    }

    const defaultBranches = [
      {
        name: "Delhi HQ",
        code: "DEL",
        city: "New Delhi",
        state: "Delhi",
        country: "India",
        status: true,
        createdBy: admin._id,
      },
      {
        name: "Ukhrul Branch",
        code: "UKH",
        city: "Ukhrul",
        state: "Manipur",
        country: "India",
        status: true,
        createdBy: admin._id,
      },
    ];

    for (const bData of defaultBranches) {
      const existing = await Branch.findOne({
        $or: [{ name: bData.name }, { code: bData.code }],
      });
      if (!existing) {
        await Branch.create(bData);
        console.log(`✅ Created branch: ${bData.name} (${bData.code})`);
      } else {
        console.log(`ℹ️ Branch already exists: ${existing.name} (${existing.code})`);
      }
    }

    console.log("🎉 Branch seeding complete!");
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed Branches Error:", err);
    process.exit(1);
  }
}

seedBranches();
