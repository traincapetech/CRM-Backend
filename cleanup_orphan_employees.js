/**
 * cleanup_orphan_employees.js
 * 
 * Removes orphaned Employee (and User) records for Afsana and Mukesh
 * that were created from a partial/failed finalize run.
 * 
 * Run once: node cleanup_orphan_employees.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

// Pre-load all models so mongoose schema registry is complete
require("./models/Department");
require("./models/EmployeeRole");
require("./models/Branch");
require("./models/JourneyTemplate");
require("./models/JourneyInstance");

const Employee = require("./models/Employee");
const User = require("./models/User");

const EMAILS_TO_CLEAN = [
  "afsana@traincapetech.in",
  // Add mukesh's email below if needed
  // "mukesh@traincapetech.in",
];

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ MONGO_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB\n");

  for (const email of EMAILS_TO_CLEAN) {
    console.log(`🔍 Checking email: ${email}`);

    const emp = await Employee.findOne({ email: email.toLowerCase() });
    if (emp) {
      // Only delete if NOT linked to a User (i.e., orphaned)
      if (!emp.userId) {
        await Employee.findByIdAndDelete(emp._id);
        console.log(`  🗑️  Deleted orphaned Employee record (no userId link): ${emp._id}`);
      } else {
        // Check if the linked User actually exists
        const linkedUser = await User.findById(emp.userId);
        if (!linkedUser) {
          await Employee.findByIdAndDelete(emp._id);
          console.log(`  🗑️  Deleted orphaned Employee record (linked User ${emp.userId} not found): ${emp._id}`);
        } else {
          console.log(`  ⚠️  Employee record found AND linked to existing User ${linkedUser.email}. NOT deleting.`);
          console.log(`     → If this is a ghost, manually delete via admin panel.`);
        }
      }
    } else {
      console.log(`  ✅ No orphaned Employee record found.`);
    }

    const usr = await User.findOne({ email: email.toLowerCase() });
    if (usr) {
      // Only remove user if they have no employeeId (ghost user)
      if (!usr.employeeId) {
        await User.findByIdAndDelete(usr._id);
        console.log(`  🗑️  Deleted ghost User record (no employeeId link): ${usr._id}`);
      } else {
        const linkedEmp = await Employee.findById(usr.employeeId);
        if (!linkedEmp) {
          await User.findByIdAndDelete(usr._id);
          console.log(`  🗑️  Deleted ghost User record (linked Employee ${usr.employeeId} not found): ${usr._id}`);
        } else {
          console.log(`  ✅ User record is properly linked to Employee. Skipping.`);
        }
      }
    } else {
      console.log(`  ✅ No ghost User record found.`);
    }

    console.log("");
  }

  console.log("🎉 Cleanup complete. You can now re-run the finalize for these candidates.");
  await mongoose.disconnect();
}

run().catch(err => {
  console.error("❌ Error:", err.message);
  mongoose.disconnect();
  process.exit(1);
});
