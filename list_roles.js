require("dotenv").config();
const mongoose = require("mongoose");
const AccessRole = require("./models/AccessRole");

const listRoles = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const roles = await AccessRole.find({});
    console.log("Existing Roles:");
    roles.forEach(r => console.log(`- ${r.name} (Permissions: ${r.permissions.length})`));
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

listRoles();
