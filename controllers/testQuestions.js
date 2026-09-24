const TestQuestion = require('../models/TestQuestion');

// @desc    List questions
// @route   GET /api/test-questions
// @access  Permission: test.create
exports.getQuestions = async (req, res) => {
  const filters = {};
  if (req.query.type) filters.type = req.query.type;
  if (req.query.difficulty) filters.difficulty = req.query.difficulty;
  if (req.query.topic) {
    if (req.query.topic === '__uncategorized__') {
      filters.$or = [{ topic: { $exists: false } }, { topic: '' }];
    } else {
      filters.topic = req.query.topic;
    }
  }

  const questions = await TestQuestion.find(filters)
    .sort({ createdAt: -1 })
    .populate('createdBy', 'fullName email');

  res.status(200).json({ success: true, data: questions });
};

// @desc    Create question
// @route   POST /api/test-questions
// @access  Permission: test.create
exports.createQuestion = async (req, res) => {
  const question = await TestQuestion.create({
    ...req.body,
    createdBy: req.user._id
  });
  res.status(201).json({ success: true, data: question });
};

// @desc    Update question
// @route   PUT /api/test-questions/:id
// @access  Permission: test.create
exports.updateQuestion = async (req, res) => {
  const question = await TestQuestion.findById(req.params.id);
  if (!question) {
    return res.status(404).json({ success: false, message: 'Question not found' });
  }

  Object.assign(question, req.body);
  await question.save();
  res.status(200).json({ success: true, data: question });
};

// @desc    Delete question
// @route   DELETE /api/test-questions/:id
// @access  Permission: test.create
exports.deleteQuestion = async (req, res) => {
  const question = await TestQuestion.findById(req.params.id);
  if (!question) {
    return res.status(404).json({ success: false, message: 'Question not found' });
  }
  await question.deleteOne();
  res.status(200).json({ success: true, data: {} });
};
