const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load env vars
dotenv.config({ path: path.join(__dirname, "../.env") });

const User = require("../models/User");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const findUser = async () => {
  await connectDB();
  const users = await User.find({
    fullName: { $regex: "Shivam", $options: "i" },
  });
  console.log(
    "Found Users:",
    users.map((u) => ({
      id: u._id,
      name: u.fullName,
      email: u.email,
      role: u.role,
    })),
  );
  process.exit();
};

findUser();
