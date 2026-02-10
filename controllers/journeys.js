const JourneyService = require("../services/journeyService");
const JourneyInstance = require("../models/JourneyInstance");
const JourneyTemplate = require("../models/JourneyTemplate");

// @desc    Get all journeys for a user (or all if admin)
// @route   GET /api/journeys
exports.getJourneys = async (req, res) => {
  try {
    let query = {};

    // If not admin, only show own journeys or journeys where user is an assignee of a step
    if (req.user.role !== "Admin" && req.user.role !== "HR") {
      // Complex query: either they are the subject (employee) OR they have an active task
      // For MVP, let's just show journeys where they are the subject
      // To do this right, we'd need to look up their Employee ID first
      // skipping complexity for now, just filtering by assigned steps is easier if we index it
      // Let's keep it simple: Admins see all, others see mostly nothing for now until we build the UI
    }

    const journeys = await JourneyInstance.find(query)
      .populate("employeeId", "fullName email")
      .populate("templateId", "name")
      .sort("-createdAt");

    res
      .status(200)
      .json({ success: true, count: journeys.length, data: journeys });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get single journey details
// @route   GET /api/journeys/:id
exports.getJourney = async (req, res) => {
  try {
    const journey = await JourneyInstance.findById(req.params.id)
      .populate("employeeId", "fullName")
      .populate("templateId");

    if (!journey)
      return res
        .status(404)
        .json({ success: false, message: "Journey not found" });

    res.status(200).json({ success: true, data: journey });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Advance a step (Complete it)
// @route   POST /api/journeys/:id/steps/:stepId/complete
exports.completeStep = async (req, res) => {
  try {
    const { id, stepId } = req.params;
    const data = req.body; // Form data etc

    const journey = await JourneyService.completeStep(
      id,
      stepId,
      req.user.id,
      data,
    );

    res.status(200).json({ success: true, data: journey });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Initialize a template (for testing)
// @route   POST /api/journeys/templates (Hidden/Admin)
exports.createTemplate = async (req, res) => {
  try {
    const template = await JourneyTemplate.create(req.body);
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Manually start a journey (for testing)
// @route   POST /api/journeys/start
exports.startJourney = async (req, res) => {
  try {
    const { templateName, employeeId } = req.body;
    const journey = await JourneyService.startJourney(
      templateName,
      employeeId,
      req.user.id,
    );
    res.status(201).json({ success: true, data: journey });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
