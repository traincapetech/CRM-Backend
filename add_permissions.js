require("dotenv").config();
const mongoose = require("mongoose");
const AccessRole = require("./models/AccessRole");

const assignPermissions = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected");

    const managerRole = await AccessRole.findOne({ name: "Manager" });
    if (!managerRole) {
      console.log("Manager role not found in AccessRole collection.");
      process.exit(1);
    }

    const permissionsToAdd = ["test.create", "test.assign", "test.report"];
    
    let updated = false;
    for (const perm of permissionsToAdd) {
      if (!managerRole.permissions.includes(perm)) {
        managerRole.permissions.push(perm);
        updated = true;
      }
    }

    if (updated) {
      await managerRole.save();
      console.log("Successfully added permissions to Manager role:", managerRole.permissions);
    } else {
      console.log("Manager already had the required test permissions.");
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Error updating permissions:", error);
    process.exit(1);
  }
};

assignPermissions();
