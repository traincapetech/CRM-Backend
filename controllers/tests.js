const Test = require('../models/Test');
const TestQuestion = require('../models/TestQuestion');
const { getUserPermissions } = require('../utils/rbac');

// @desc    List tests
// @route   GET /api/tests
// @access  Permission: test.create or test.assign or test.report
exports.getTests = async (req, res) => {
  const { permissions } = await getUserPermissions(req.user);
  const canViewAll = permissions.includes('test.report') || permissions.includes('test.assign');

  const query = canViewAll ? {} : { createdBy: req.user._id };
  const tests = await Test.find(query)
    .sort({ createdAt: -1 })
    .populate('createdBy', 'fullName email');

  res.status(200).json({ success: true, data: tests });
};

// @desc    Get test by id
// @route   GET /api/tests/:id
// @access  Permission: test.create or test.assign or test.report
exports.getTest = async (req, res) => {
  const test = await Test.findById(req.params.id).populate('questions');
  if (!test) {
    return res.status(404).json({ success: false, message: 'Test not found' });
  }
  res.status(200).json({ success: true, data: test });
};

// @desc    Create test
// @route   POST /api/tests
// @access  Permission: test.create
exports.createTest = async (req, res) => {
  const { title, description, durationMinutes, scheduleStart, scheduleEnd, shuffleQuestions, shuffleOptions, violationThreshold, passingScore, questions } = req.body;

  const existingQuestions = await TestQuestion.find({ _id: { $in: questions || [] } }).select('_id');
  const questionIds = existingQuestions.map(q => q._id);

  const test = await Test.create({
    title,
    description,
    durationMinutes,
    scheduleStart,
    scheduleEnd,
    shuffleQuestions,
    shuffleOptions,
    violationThreshold,
    passingScore,
    questions: questionIds,
    createdBy: req.user._id
  });

  res.status(201).json({ success: true, data: test });
};

// @desc    Update test
// @route   PUT /api/tests/:id
// @access  Permission: test.create
exports.updateTest = async (req, res) => {
  const test = await Test.findById(req.params.id);
  if (!test) {
    return res.status(404).json({ success: false, message: 'Test not found' });
  }

  const updates = { ...req.body, updatedBy: req.user._id };
  if (Array.isArray(req.body.questions)) {
    const existingQuestions = await TestQuestion.find({ _id: { $in: req.body.questions } }).select('_id');
    updates.questions = existingQuestions.map(q => q._id);
  }

  Object.assign(test, updates);
  await test.save();

  res.status(200).json({ success: true, data: test });
};

// @desc    Delete test
// @route   DELETE /api/tests/:id
// @access  Permission: test.create
exports.deleteTest = async (req, res) => {
  const test = await Test.findById(req.params.id);
  if (!test) {
    return res.status(404).json({ success: false, message: 'Test not found' });
  }
  await test.deleteOne();
  res.status(200).json({ success: true, data: {} });
};
