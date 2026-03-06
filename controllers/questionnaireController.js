const Questionnaire = require("../models/Questionnaire");
const QuestionnaireResponse = require("../models/QuestionnaireResponse");
const User = require("../models/User");
const notificationService = require("../services/notificationService");


// @desc    Create a new questionnaire
// @route   POST /api/questionnaires
// @access  Private/Admin
exports.createQuestionnaire = async (req, res) => {
  try {
    req.body.createdBy = req.user.id;
    const questionnaire = await Questionnaire.create(req.body);

    // Notify assigned users and roles
    if (questionnaire.status === "published") {
      const usersToNotify = new Set(questionnaire.assignedToUsers.map(id => id.toString()));
      
      // If roles are assigned, find users with those roles
      if (questionnaire.assignedToRoles?.length > 0) {
        const roleUsers = await User.find({ role: { $in: questionnaire.assignedToRoles } }).select('_id');
        roleUsers.forEach(u => usersToNotify.add(u._id.toString()));
      }

      // Create notifications for each user
      for (const userId of usersToNotify) {
        await notificationService.createNotification({
          recipient: userId,
          type: "ACTIVITY",
          questionnaireId: questionnaire._id,
          message: `New activity assigned: ${questionnaire.title}`
        });
        
        // Emit real-time update event
        notificationService.broadcastToUser(userId, "new-activity", {
          activityId: questionnaire._id,
          title: questionnaire.title
        });
      }

      // Also notify all admins to refresh their list
      console.log("📢 Broadcasting new-activity to role-Admin");
      notificationService.broadcastToRole("Admin", "new-activity", {
        activityId: questionnaire._id,
        title: questionnaire.title,
        isAdminUpdate: true
      });
    }



    res.status(201).json({

      success: true,
      data: questionnaire,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all questionnaires
// @route   GET /api/questionnaires
// @access  Private
exports.getQuestionnaires = async (req, res) => {
  try {
    let query;

    // Admin can see everything
    if (req.user.role === "Admin") {
      query = Questionnaire.find().populate("createdBy", "fullName email");
    } else {
      // Users see questionnaires assigned to them or their role
      query = Questionnaire.find({
        $or: [
          { assignedToUsers: req.user.id },
          { assignedToRoles: req.user.role },
        ],
        active: true,
        status: "published",
      }).populate("createdBy", "fullName email");
    }

    const questionnaires = await query.sort("-createdAt");

    res.status(200).json({
      success: true,
      count: questionnaires.length,
      data: questionnaires,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Get single questionnaire
// @route   GET /api/questionnaires/:id
// @access  Private
exports.getQuestionnaire = async (req, res) => {
  try {
    const questionnaire = await Questionnaire.findById(req.params.id).populate(
      "createdBy",
      "fullName email",
    );

    if (!questionnaire) {
      return res.status(404).json({
        success: false,
        message: "Questionnaire not found",
      });
    }

    // Permission check
    if (
      req.user.role !== "Admin" &&
      !questionnaire.assignedToUsers.includes(req.user.id) &&
      !questionnaire.assignedToRoles.includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "User not authorized to access this questionnaire",
      });
    }

    res.status(200).json({
      success: true,
      data: questionnaire,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Update questionnaire
// @route   PUT /api/questionnaires/:id
// @access  Private/Admin
exports.updateQuestionnaire = async (req, res) => {
  try {
    let questionnaire = await Questionnaire.findById(req.params.id);

    if (!questionnaire) {
      return res.status(404).json({
        success: false,
        message: "Questionnaire not found",
      });
    }

    const oldStatus = questionnaire.status;
    
    questionnaire = await Questionnaire.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      },
    );

    // Notify if status changed from draft to published
    if (oldStatus !== "published" && questionnaire.status === "published") {
      const usersToNotify = new Set(questionnaire.assignedToUsers.map(id => id.toString()));
      
      if (questionnaire.assignedToRoles?.length > 0) {
        const roleUsers = await User.find({ role: { $in: questionnaire.assignedToRoles } }).select('_id');
        roleUsers.forEach(u => usersToNotify.add(u._id.toString()));
      }

      for (const userId of usersToNotify) {
        // ... (notifications)
        notificationService.broadcastToUser(userId, "new-activity", {
          activityId: questionnaire._id,
          title: questionnaire.title
        });
      }

      // Also notify all admins
      notificationService.broadcastToRole("Admin", "new-activity", {
        activityId: questionnaire._id,
        title: questionnaire.title,
        isAdminUpdate: true
      });
    } else if (questionnaire.status === "published") {
      // ...
      // Also notify all admins
      notificationService.broadcastToRole("Admin", "new-activity", {
        activityId: questionnaire._id,
        title: questionnaire.title,
        isAdminUpdate: true
      });
    }



    res.status(200).json({
      success: true,
      data: questionnaire,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete questionnaire
// @route   DELETE /api/questionnaires/:id
// @access  Private/Admin
exports.deleteQuestionnaire = async (req, res) => {
  try {
    const questionnaire = await Questionnaire.findById(req.params.id);

    if (!questionnaire) {
      return res.status(404).json({
        success: false,
        message: "Questionnaire not found",
      });
    }

    await questionnaire.deleteOne();

    // Also delete associated responses
    await QuestionnaireResponse.deleteMany({ questionnaireId: req.params.id });

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Submit questionnaire response
// @route   POST /api/questionnaires/:id/submit
// @access  Private
exports.submitResponse = async (req, res) => {
  try {
    const questionnaireId = req.params.id;
    const questionnaire = await Questionnaire.findById(questionnaireId);

    if (!questionnaire) {
      return res.status(404).json({
        success: false,
        message: "Questionnaire not found",
      });
    }

    // Check if user is assigned
    if (
      req.user.role !== "Admin" &&
      !questionnaire.assignedToUsers.includes(req.user.id) &&
      !questionnaire.assignedToRoles.includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "User not authorized to submit response for this activity",
      });
    }

    // Check if already submitted and editing is not allowed
    const existingResponse = await QuestionnaireResponse.findOne({
      questionnaireId,
      userId: req.user.id,
    });

    if (existingResponse && !questionnaire.allowEditingAfterSubmission) {
      return res.status(400).json({
        success: false,
        message: "You have already submitted your response for this activity",
      });
    }

    const { answers } = req.body;

    if (existingResponse) {
      // Update existing
      existingResponse.answers = answers;
      existingResponse.submittedAt = Date.now();
      await existingResponse.save();
      
      return res.status(200).json({
        success: true,
        message: "Response updated successfully",
        data: existingResponse,
      });
    } else {
      // Create new
      const response = await QuestionnaireResponse.create({
        questionnaireId,
        userId: req.user.id,
        userName: req.user.fullName,
        answers,
      });

      // Notify the creator
      await notificationService.createNotification({
        recipient: questionnaire.createdBy,
        type: "ACTIVITY",
        questionnaireId: questionnaire._id,
        message: `${req.user.fullName} submitted a response for: ${questionnaire.title}`
      });

      // Emit real-time update event to all admins
      console.log("📢 Broadcasting new-response to role-Admin for questionnaire:", questionnaire._id);
      notificationService.broadcastToRole("Admin", "new-response", {
        questionnaireId: questionnaire._id,
        userName: req.user.fullName,
        responseId: response._id
      });



      res.status(201).json({

        success: true,
        message: "Response submitted successfully",
        data: response,
      });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all responses for a questionnaire
// @route   GET /api/questionnaires/:id/responses
// @access  Private/Admin
exports.getQuestionnaireResponses = async (req, res) => {
  try {
    const responses = await QuestionnaireResponse.find({
      questionnaireId: req.params.id,
    }).sort("-submittedAt");

    res.status(200).json({
      success: true,
      count: responses.length,
      data: responses,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Get my response for a questionnaire
// @route   GET /api/questionnaires/:id/my-response
// @access  Private
exports.getMyResponse = async (req, res) => {
  try {
    const response = await QuestionnaireResponse.findOne({
      questionnaireId: req.params.id,
      userId: req.user.id,
    });

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
