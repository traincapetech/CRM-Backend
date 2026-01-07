/**
 * Workflow Controller
 * 
 * Handles workflow CRUD operations
 */

const Workflow = require('../models/Workflow');
const workflowService = require('../services/workflowService');

// @desc    Get all workflows
// @route   GET /api/workflows
// @access  Private (Admin, Manager)
exports.getWorkflows = async (req, res) => {
  try {
    const workflows = await Workflow.find({ createdBy: req.user.id })
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: workflows.length,
      data: workflows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single workflow
// @route   GET /api/workflows/:id
// @access  Private
exports.getWorkflow = async (req, res) => {
  try {
    const workflow = await Workflow.findById(req.params.id)
      .populate('createdBy', 'fullName email');

    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: 'Workflow not found'
      });
    }

    res.status(200).json({
      success: true,
      data: workflow
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create workflow
// @route   POST /api/workflows
// @access  Private (Admin, Manager)
exports.createWorkflow = async (req, res) => {
  try {
    req.body.createdBy = req.user.id;
    const workflow = await Workflow.create(req.body);

    res.status(201).json({
      success: true,
      data: workflow
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update workflow
// @route   PUT /api/workflows/:id
// @access  Private
exports.updateWorkflow = async (req, res) => {
  try {
    req.body.updatedBy = req.user.id;
    const workflow = await Workflow.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: 'Workflow not found'
      });
    }

    res.status(200).json({
      success: true,
      data: workflow
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete workflow
// @route   DELETE /api/workflows/:id
// @access  Private
exports.deleteWorkflow = async (req, res) => {
  try {
    const workflow = await Workflow.findById(req.params.id);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: 'Workflow not found'
      });
    }

    await workflow.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Workflow deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Execute workflow manually
// @route   POST /api/workflows/:id/execute
// @access  Private
exports.executeWorkflow = async (req, res) => {
  try {
    const workflow = await Workflow.findById(req.params.id);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: 'Workflow not found'
      });
    }

    const result = await workflowService.executeWorkflow(workflow, req.body.data || {});

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get workflow statistics
// @route   GET /api/workflows/:id/stats
// @access  Private
exports.getWorkflowStats = async (req, res) => {
  try {
    const workflow = await Workflow.findById(req.params.id);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: 'Workflow not found'
      });
    }

    const successRate = workflow.stats.totalExecutions > 0
      ? (workflow.stats.successfulExecutions / workflow.stats.totalExecutions) * 100
      : 0;

    res.status(200).json({
      success: true,
      data: {
        ...workflow.stats,
        successRate: successRate.toFixed(2)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

