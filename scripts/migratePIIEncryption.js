/**
 * Migration script to encrypt existing PII data in the database
 * Run with: node scripts/migratePIIEncryption.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { encrypt, isEncrypted, hashForSearch } = require("../utils/encryption");

const MONGO_URI = process.env.MONGO_URI;

async function migrateEmployees() {
  const Employee = mongoose.model("Employee");
  const PII_FIELDS = [
    "phoneNumber",
    "whatsappNumber",
    "currentAddress",
    "permanentAddress",
    "dateOfBirth",
    "aadharCard",
    "panCard",
    "bankAccountNumber",
    "upiId",
  ];

  const employees = await Employee.find({});
  console.log(`Found ${employees.length} employees to migrate`);

  let migrated = 0;
  for (const emp of employees) {
    let modified = false;

    for (const field of PII_FIELDS) {
      if (emp[field] && !isEncrypted(emp[field])) {
        emp[field] = encrypt(emp[field]);
        modified = true;
      }
    }

    if (modified) {
      await emp.save({ validateBeforeSave: false });
      migrated++;
    }
  }

  console.log(`Migrated ${migrated} employees`);
}

async function migrateLeads() {
  const Lead = mongoose.model("Lead");
  const leads = await Lead.find({});
  console.log(`Found ${leads.length} leads to migrate`);

  let migrated = 0;
  for (const lead of leads) {
    let modified = false;

    // Encrypt email and generate hash
    if (lead.email && !isEncrypted(lead.email)) {
      lead.emailHash = hashForSearch(lead.email);
      lead.email = encrypt(lead.email);
      modified = true;
    }

    // Encrypt phone and generate hash
    if (lead.phone && !isEncrypted(lead.phone)) {
      lead.phoneHash = hashForSearch(lead.phone);
      lead.phone = encrypt(lead.phone);
      modified = true;
    }

    if (modified) {
      await lead.save({ validateBeforeSave: false });
      migrated++;
    }
  }

  console.log(`Migrated ${migrated} leads`);
}

async function main() {
  console.log("Starting PII encryption migration...\n");

  if (!process.env.ENCRYPTION_KEY) {
    console.error("ERROR: ENCRYPTION_KEY environment variable is required");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB\n");

  // Load models
  require("../models/Employee");
  require("../models/Lead");

  await migrateEmployees();
  await migrateLeads();

  console.log("\nMigration complete!");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
