const JourneyService = require("../services/journeyService");
const JourneyInstance = require("../models/JourneyInstance");
const JourneyTemplate = require("../models/JourneyTemplate");

// @desc    Get all journeys for a user (or all if admin/HR)
// @route   GET /api/journeys
exports.getJourneys = async (req, res) => {
  try {
    const { category } = req.query;
    let query = {};

    // 1. Visibility Logic
    if (!["Admin", "HR", "Manager"].includes(req.user.role)) {
      // For regular employees, find their Employee record first
      const Employee = require("../models/Employee");
      const employee = await Employee.findOne({ userId: req.user.id });
      
      if (employee) {
        // Show journeys where they are the subject OR journeys where they are assigned to a step
        query = {
          $or: [
            { employeeId: employee._id },
            { "steps.assignedToUser": req.user.id }
          ]
        };
      } else {
        // If no employee record, only show journeys where they are an assignee
        query = { "steps.assignedToUser": req.user.id };
      }
    }

    // 2. Fetch with population
    let journeys = await JourneyInstance.find(query)
      .populate("employeeId", "fullName email")
      .populate("templateId")
      .sort("-createdAt");

    // 3. Category Filter (Manual filtering since category is on template)
    if (category) {
      journeys = journeys.filter(j => j.templateId?.category === category);
    }

    res.status(200).json({ 
      success: true, 
      count: journeys.length, 
      data: journeys 
    });
  } catch (error) {
    console.error("Error in getJourneys:", error);
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
