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
   * Helper to find the correct User ID for a role string from a template step.
   * Resolves role strings like 'HR', 'IT_ADMIN', 'ADMIN', 'MANAGER', 'SELF'
   * to actual User document IDs.
   */
  async _resolveAssignee(role, employee) {
    // The employee themselves (for self-completion steps like policy ack)
    if (role === "SELF") return employee.userId || null;

    // Use the HR person linked to this employee, else any HR user, else Admin
    if (role === "HR") {
      if (employee.hrId) return employee.hrId;
      const hr = await User.findOne({ role: "HR", active: true });
      if (hr) return hr._id;
      // Fallback to Admin if no HR exists
      const admin = await User.findOne({ role: "Admin", active: true });
      return admin?._id || null;
    }

    // Reporting manager — fall back to Admin
    if (role === "MANAGER") {
      if (employee.hrId) return employee.hrId; // In this system hrId often acts as manager reference
      const manager = await User.findOne({ role: "Manager", active: true });
      if (manager) return manager._id;
      const admin = await User.findOne({ role: "Admin", active: true });
      return admin?._id || null;
    }

    // IT staff — prefer IT Manager, else IT Staff, else Admin
    if (role === "IT_ADMIN") {
      const itManager = await User.findOne({ role: "IT Manager", active: true });
      if (itManager) return itManager._id;
      const itStaff = await User.findOne({ role: "IT Staff", active: true });
      if (itStaff) return itStaff._id;
      const admin = await User.findOne({ role: "Admin", active: true });
      return admin?._id || null;
    }

    // Admin department tasks (ID card, access badge)
    if (role === "ADMIN") {
      const admin = await User.findOne({ role: "Admin", active: true });
      return admin?._id || null;
    }

    // Default fallback to any active Admin
    const admin = await User.findOne({ role: "Admin", active: true });
    return admin?._id || null;
  }
}

module.exports = new JourneyService();
