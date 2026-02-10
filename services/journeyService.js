const JourneyTemplate = require("../models/JourneyTemplate");
const JourneyInstance = require("../models/JourneyInstance");
const Employee = require("../models/Employee");
const FeedService = require("./feedService");
const User = require("../models/User");

class JourneyService {
  /**
   * Start a new journey for an employee based on a template
   */
  async startJourney(templateName, employeeId, triggerUserId) {
    // 1. Fetch Template
    const template = await JourneyTemplate.findOne({
      name: templateName,
      isActive: true,
    });
    if (!template)
      throw new Error(
        `Journey template '${templateName}' not found or inactive`,
      );

    // 2. Fetch Employee Context (Need Manager/HR info)
    const employee = await Employee.findById(employeeId).populate("userId");
    if (!employee) throw new Error("Employee not found");

    // 3. Initialize Steps
    const steps = template.steps.map((step) => ({
      stepId: step.stepId,
      status: "LOCKED",
      data: {},
    }));

    // 4. Create Instance
    const journey = await JourneyInstance.create({
      templateId: template._id,
      employeeId: employee._id,
      steps: steps,
      status: "ACTIVE",
      percentageComplete: 0,
    });

    // 5. Evaluate Initial Steps (Unlock steps with no dependencies)
    await this.evaluateSteps(journey._id);

    return journey;
  }

  /**
   * Evaluate the state of the journey and unlock/assign steps
   */
  async evaluateSteps(journeyId) {
    const journey =
      await JourneyInstance.findById(journeyId).populate("templateId");
    if (!journey || journey.status !== "ACTIVE") return;

    const template = journey.templateId;
    const employee = await Employee.findById(journey.employeeId);
    let updated = false;

    // Map of step statuses for dependency checking
    const stepStatusMap = journey.steps.reduce((acc, s) => {
      acc[s.stepId] = s.status;
      return acc;
    }, {});

    for (const stepState of journey.steps) {
      // Only process LOCKED steps
      if (stepState.status !== "LOCKED") continue;

      const templateStep = template.steps.find(
        (s) => s.stepId === stepState.stepId,
      );
      if (!templateStep) continue;

      // Check Dependencies
      const dependenciesMet = templateStep.dependencyStepIds.every(
        (depId) => stepStatusMap[depId] === "COMPLETED",
      );

      if (dependenciesMet) {
        // Unlock and Assign
        stepState.status = "PENDING";
        stepState.assignedAt = new Date();

        // DATA RESOLUTION: Who is this assigned to?
        const assigneeId = await this._resolveAssignee(
          templateStep.assigneeRole,
          employee,
        );
        stepState.assignedToUser = assigneeId;

        // CREATE FEED ITEM
        if (assigneeId) {
          const actionTitle =
            templateStep.actionConfig?.feedActionTitle || templateStep.title;
          const actionSubtitle =
            templateStep.actionConfig?.feedActionSubtitle ||
            `Task for ${employee.fullName}`;

          const feedItem = await FeedService.createAction({
            userId: assigneeId,
            type: templateStep.type === "APPROVAL" ? "APPROVAL" : "TASK",
            module: "JOURNEY",
            title: actionTitle,
            subtitle: actionSubtitle,
            priority: 2,
            sourceCollection: "JourneyInstance",
            sourceId: journey._id,
            actionsPayload: {
              journeyId: journey._id,
              stepId: stepState.stepId,
              link:
                templateStep.actionConfig?.uiLink || `/journeys/${journey._id}`,
              primaryAction:
                templateStep.type === "APPROVAL" ? "APPROVE" : "COMPLETE",
            },
          });

          stepState.feedActionId = feedItem._id;
        }

        updated = true;
      }
    }

    if (updated) {
      // Check if Journey is Complete
      const allCompleted = journey.steps.every(
        (s) => s.status === "COMPLETED" || s.status === "SKIPPED",
      );
      if (allCompleted) {
        journey.status = "COMPLETED";
      } else {
        // Update Progress
        const completedCount = journey.steps.filter(
          (s) => s.status === "COMPLETED",
        ).length;
        journey.percentageComplete = Math.round(
          (completedCount / journey.steps.length) * 100,
        );
      }

      await journey.save();
    }
  }

  /**
   * Mark a step as complete
   */
  async completeStep(journeyId, stepId, userId, data = {}) {
    const journey = await JourneyInstance.findById(journeyId);
    if (!journey) throw new Error("Journey not found");

    const step = journey.steps.find((s) => s.stepId === stepId);
    if (!step) throw new Error("Step not found");

    // Validation: Is this user allowed? (Simple check for now)
    // In real app, check if userId matches assignedToUser or is Admin

    step.status = "COMPLETED";
    step.completedAt = new Date();
    step.completedBy = userId;
    step.data = data;

    // Resolving the Action Item in Feed
    if (step.feedActionId) {
      await FeedService.markActioned(step.feedActionId);
    }

    await journey.save();

    // Trigger next steps
    await this.evaluateSteps(journeyId);

    return journey;
  }

  /**
   * Helper to find the correct User ID for a role
   */
  async _resolveAssignee(role, employee) {
    if (role === "SELF") return employee.userId;

    if (role === "MANAGER") {
      // Assuming we have manager logic, fallback to HR/Admin if not
      // For MVP, we don't have direct manager link in Employee schema yet?
      // Let's use HR ID as a proxy or find an Admin
      if (employee.hrId) return employee.hrId;
    }

    if (role === "HR") {
      if (employee.hrId) return employee.hrId;
      // Fallback to any HR
      const hr = await User.findOne({ role: "HR" });
      return hr ? hr._id : null;
    }

    if (role === "IT_ADMIN") {
      // Find IT Manager
      // Since we don't have separate role for IT Manager in AccessRoles yet effectively,
      // we look for 'Manager' in 'IT' department maybe?
      // For MVP, send to Admin
      const admin = await User.findOne({ role: "Admin" });
      return admin._id;
    }

    // Default fallback
    const admin = await User.findOne({ role: "Admin" });
    return admin ? admin._id : null;
  }
}

module.exports = new JourneyService();
