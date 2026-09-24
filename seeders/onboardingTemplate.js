/**
 * Onboarding Journey Template Seeder
 * Run: node server/seeders/onboardingTemplate.js
 * Or it is called automatically at server startup if the template doesn't exist.
 */

const mongoose = require("mongoose");
const JourneyTemplate = require("../models/JourneyTemplate");

const ONBOARDING_TEMPLATE = {
  name: "Employee Onboarding",
  description:
    "Standard onboarding checklist automatically triggered when a new employee profile is created.",
  category: "ONBOARDING",
  isActive: true,
  triggerEvent: "EMPLOYEE_CREATED",
  steps: [
    // ─── HR Steps ────────────────────────────────────────────────────────
    {
      stepId: "hr-welcome",
      title: "Send Welcome Email & Offer Letter",
      description:
        "Send the official welcome email with company details and a copy of the signed offer letter.",
      type: "TASK",
      assigneeRole: "HR",
      dependencyStepIds: [],
      slaDays: 1,
      actionConfig: {
        feedActionTitle: "📧 Send Welcome Email",
        feedActionSubtitle: "New employee onboarding — Day 1 action",
        uiLink: "/employees",
      },
    },
    {
      stepId: "hr-docs-collection",
      title: "Collect KYC & HR Documents",
      description:
        "Collect Aadhaar, PAN, 10th/12th/degree certificates, photograph, and police clearance certificate (PCC).",
      type: "TASK",
      assigneeRole: "HR",
      dependencyStepIds: ["hr-welcome"],
      slaDays: 3,
      actionConfig: {
        feedActionTitle: "📁 Collect KYC Documents",
        feedActionSubtitle: "Gather mandatory identity and education documents",
        uiLink: "/employees",
      },
    },
    {
      stepId: "hr-payroll-setup",
      title: "Setup Payroll & Bank Details",
      description:
        "Enter bank account details, UPI, set salary, and configure payroll in the system.",
      type: "TASK",
      assigneeRole: "HR",
      dependencyStepIds: ["hr-docs-collection"],
      slaDays: 5,
      actionConfig: {
        feedActionTitle: "💰 Setup Payroll",
        feedActionSubtitle: "Configure salary and bank details in payroll",
        uiLink: "/payroll",
      },
    },
    // ─── IT Steps ────────────────────────────────────────────────────────
    {
      stepId: "it-account-creation",
      title: "Create Email & System Accounts",
      description:
        "Create official company email, CRM login credentials, and any required system accounts.",
      type: "TASK",
      assigneeRole: "IT_ADMIN",
      dependencyStepIds: [],
      slaDays: 1,
      actionConfig: {
        feedActionTitle: "🔐 Create System Accounts",
        feedActionSubtitle: "Provision email and CRM login for new employee",
        uiLink: "/employees",
      },
    },
    {
      stepId: "it-device-provisioning",
      title: "Provision Laptop / Hardware",
      description:
        "Allocate and configure a laptop or workstation. Install required software and set up the development environment if applicable.",
      type: "TASK",
      assigneeRole: "IT_ADMIN",
      dependencyStepIds: ["it-account-creation"],
      slaDays: 2,
      actionConfig: {
        feedActionTitle: "💻 Provision Hardware",
        feedActionSubtitle: "Assign and configure laptop for new employee",
        uiLink: "/employees",
      },
    },
    {
      stepId: "it-access-provisioning",
      title: "Grant Software Access & Permissions",
      description:
        "Grant access to required tools: Slack, GitHub, project management tools, CRM modules, and shared drives.",
      type: "TASK",
      assigneeRole: "IT_ADMIN",
      dependencyStepIds: ["it-device-provisioning"],
      slaDays: 3,
      actionConfig: {
        feedActionTitle: "🔑 Grant Access & Permissions",
        feedActionSubtitle: "Assign software licenses and system permissions",
        uiLink: "/employees",
      },
    },
    // ─── Admin Steps ─────────────────────────────────────────────────────
    {
      stepId: "admin-id-card",
      title: "Issue ID Card & Access Badge",
      description:
        "Print and issue the official employee ID card and office access badge.",
      type: "TASK",
      assigneeRole: "ADMIN",
      dependencyStepIds: ["hr-docs-collection"],
      slaDays: 3,
      actionConfig: {
        feedActionTitle: "🪪 Issue ID Card",
        feedActionSubtitle: "Print and hand over official ID and access badge",
        uiLink: "/employees",
      },
    },
    // ─── Manager Steps ───────────────────────────────────────────────────
    {
      stepId: "manager-intro",
      title: "Manager Introduction & Team Meeting",
      description:
        "Schedule a 1:1 introduction with the reporting manager and a team welcome meeting.",
      type: "TASK",
      assigneeRole: "MANAGER",
      dependencyStepIds: ["hr-welcome"],
      slaDays: 5,
      actionConfig: {
        feedActionTitle: "🤝 Schedule Team Introduction",
        feedActionSubtitle:
          "Arrange 1:1 and team welcome meeting for new employee",
        uiLink: "/employees",
      },
    },
    // ─── Self Steps ──────────────────────────────────────────────────────
    {
      stepId: "employee-policy-ack",
      title: "Policy Acknowledgement",
      description:
        "Employee reads and acknowledges the company HR policy, code of conduct, and NDA.",
      type: "FORM",
      assigneeRole: "SELF",
      dependencyStepIds: ["hr-welcome", "it-account-creation"],
      slaDays: 7,
      actionConfig: {
        feedActionTitle: "📜 Acknowledge Company Policies",
        feedActionSubtitle: "Please read and confirm HR policy & code of conduct",
        uiLink: "/employees",
        requiredFields: ["policyAcknowledged", "ndaSigned"],
      },
    },
  ],
};

async function seedOnboardingTemplate() {
  try {
    const existing = await JourneyTemplate.findOne({
      name: "Employee Onboarding",
    });

    if (existing) {
      console.log(
        "✅ Onboarding template already exists. Skipping seed."
      );
      return existing;
    }

    const template = await JourneyTemplate.create(ONBOARDING_TEMPLATE);
    console.log(
      `✅ Onboarding Journey Template seeded successfully (ID: ${template._id})`
    );
    return template;
  } catch (err) {
    console.error("❌ Failed to seed onboarding template:", err.message);
    throw err;
  }
}

// Allow running directly: node server/seeders/onboardingTemplate.js
if (require.main === module) {
  require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
  mongoose
    .connect(process.env.MONGO_URI)
    .then(async () => {
      await seedOnboardingTemplate();
      mongoose.disconnect();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedOnboardingTemplate };
