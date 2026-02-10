const mongoose = require("mongoose");
const dotenv = require("dotenv");
const JourneyService = require("../services/journeyService");
const JourneyTemplate = require("../models/JourneyTemplate");
const JourneyInstance = require("../models/JourneyInstance");
const ActionItem = require("../models/ActionItem");
const User = require("../models/User");
const Employee = require("../models/Employee");
const Department = require("../models/Department");
const EmployeeRole = require("../models/EmployeeRole");

dotenv.config();

const simulateOnboarding = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected");

    const admin = await User.findOne({ role: "Admin" });

    // 1. Create Onboarding Template
    console.log("Creating Onboarding Template...");
    const templateName = "Employee Onboarding v1";

    // Cleanup existing
    await JourneyTemplate.deleteOne({ name: templateName });

    const template = await JourneyTemplate.create({
      name: templateName,
      category: "ONBOARDING",
      steps: [
        {
          stepId: "IT_SETUP",
          title: "Provision Laptop & Email",
          type: "TASK",
          assigneeRole: "IT_ADMIN", // Should go to Admin for now
          slaDays: 2,
        },
        {
          stepId: "WELCOME_EMAIL",
          title: "Send Welcome Email",
          type: "TASK",
          assigneeRole: "HR",
          dependencyStepIds: ["IT_SETUP"], // Depends on IT
          slaDays: 1,
        },
        {
          stepId: "PROFILE_SETUP",
          title: "Complete Profile & Docs",
          type: "FORM",
          assigneeRole: "SELF",
          dependencyStepIds: ["IT_SETUP"], // Depends on IT
          slaDays: 3,
        },
      ],
    });

    // 2. Create Test Employee
    const timestamp = Date.now();
    const testUser = await User.create({
      fullName: "Journey Walker",
      email: `walker.${timestamp}@example.com`,
      password: "password123",
      role: "Employee",
    });

    const employee = await Employee.create({
      userId: testUser._id,
      fullName: testUser.fullName,
      email: testUser.email,
      hrId: admin._id,
      department: new mongoose.Types.ObjectId(), // Fake
      role: new mongoose.Types.ObjectId(), // Fake
    });

    // 3. Start Journey
    console.log("Starting Journey...");
    const journey = await JourneyService.startJourney(
      templateName,
      employee._id,
      admin._id,
    );
    console.log(`Journey Started: ${journey._id}`);

    // 4. Verify Initial State (IT Step should be PENDING, others LOCKED)
    const journeyCheck = await JourneyInstance.findById(journey._id);
    const itStep = journeyCheck.steps.find((s) => s.stepId === "IT_SETUP");
    const hrStep = journeyCheck.steps.find((s) => s.stepId === "WELCOME_EMAIL");

    console.log(`IT Step Status: ${itStep.status} (Expected: PENDING)`);
    console.log(`HR Step Status: ${hrStep.status} (Expected: LOCKED)`);

    if (itStep.status !== "PENDING")
      throw new Error("IT Step should be PENDING");
    if (hrStep.status !== "LOCKED") throw new Error("HR Step should be LOCKED");

    // 5. Verify Feed Item for IT Admin (Admin)
    const feedItem = await ActionItem.findOne({
      sourceId: journey._id,
      userId: admin._id,
      title: "Provision Laptop & Email",
    });

    if (feedItem) {
      console.log("✅ Feed Item created for IT Admin!");
    } else {
      console.error("❌ Missing Feed Item for IT Admin");
    }

    // 6. Complete IT Step
    console.log("Completing IT Step...");
    await JourneyService.completeStep(journey._id, "IT_SETUP", admin._id);

    // 7. Verify HR Step Unlocked
    const journeyCheck2 = await JourneyInstance.findById(journey._id);
    const hrStep2 = journeyCheck2.steps.find(
      (s) => s.stepId === "WELCOME_EMAIL",
    );

    console.log(
      `HR Step Status after IT complete: ${hrStep2.status} (Expected: PENDING)`,
    );

    if (hrStep2.status === "PENDING") {
      console.log("✅ Dependency logic working! HR step unlocked.");
    } else {
      console.error("❌ Dependency logic failed");
    }

    // Cleanup
    console.log("Cleaning up...");
    await User.findByIdAndDelete(testUser._id);
    await Employee.findByIdAndDelete(employee._id);
    await JourneyTemplate.deleteOne({ _id: template._id });
    await JourneyInstance.deleteOne({ _id: journey._id });
    await ActionItem.deleteMany({ sourceId: journey._id });
  } catch (error) {
    console.error("Simulation Failed:", error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

simulateOnboarding();
