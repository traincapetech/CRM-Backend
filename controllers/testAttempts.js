const crypto = require('crypto');
const TestAttempt = require('../models/TestAttempt');
const TestAssignment = require('../models/TestAssignment');
const Test = require('../models/Test');
const TestQuestion = require('../models/TestQuestion');
const { getUserRoleNames } = require('../utils/rbac');
const { assignmentMatchesUser, isAssignmentActive } = require('./testAssignments');

const shuffleArray = (items) => {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const sanitizeQuestions = (questionSnapshots) => questionSnapshots.map((q) => ({
  questionId: q.questionId,
  type: q.type,
  text: q.text,
  options: q.options || [],
  marks: q.marks
}));

const sanitizeAttempt = (attempt, { includeToken } = { includeToken: false }) => {
  const payload = attempt.toObject();
  if (!includeToken) {
    delete payload.attemptToken;
  }
  if (Array.isArray(payload.questionSnapshots)) {
    payload.questionSnapshots = payload.questionSnapshots.map((q) => ({
      ...q,
      correctOptionIndex: undefined
    }));
  }
  return payload;
};

const evaluateAttempt = (attempt) => {
  let score = 0;
  attempt.answers.forEach((answer) => {
    if (answer.type === 'MCQ') {
      const question = attempt.questionSnapshots.find(q => q.questionId.toString() === answer.questionId.toString());
      if (question && typeof answer.selectedOptionIndex === 'number') {
        answer.isCorrect = answer.selectedOptionIndex === question.correctOptionIndex;
        answer.marksAwarded = answer.isCorrect ? question.marks : 0;
      }
      score += answer.marksAwarded || 0;
    } else {
      score += answer.marksAwarded || 0;
    }
  });
  attempt.score = score;
  return attempt;
};

const autoSubmitIfExpired = async (attempt) => {
  if (attempt.status !== 'in_progress') return attempt;
  if (new Date() <= attempt.expiresAt) return attempt;

  attempt.status = 'auto_submitted';
  attempt.submittedAt = new Date();
  evaluateAttempt(attempt);
  await attempt.save();
  return attempt;
};

// @desc    Start test attempt
// @route   POST /api/test-attempts/start
// @access  Permission: test.take
exports.startAttempt = async (req, res) => {
  const { assignmentId } = req.body;
  const assignment = await TestAssignment.findById(assignmentId).populate('test');
  if (!assignment) {
    return res.status(404).json({ success: false, message: 'Assignment not found' });
  }

  const roleNames = getUserRoleNames(req.user);
  const matches = await assignmentMatchesUser(assignment, req.user._id, roleNames);
  if (!matches || !isAssignmentActive(assignment)) {
    return res.status(403).json({ success: false, message: 'Not assigned to this test' });
  }

  const test = await Test.findById(assignment.test._id).populate('questions');
  if (!test) {
    return res.status(404).json({ success: false, message: 'Test not found' });
  }

  const now = new Date();
  if (test.scheduleStart && now < test.scheduleStart) {
    return res.status(403).json({ success: false, message: 'Test not yet available' });
  }
  if (test.scheduleEnd && now > test.scheduleEnd) {
    return res.status(403).json({ success: false, message: 'Test window closed' });
  }

  const existingAttempt = await TestAttempt.findOne({
    test: test._id,
    assignment: assignment._id,
    user: req.user._id,
    status: 'in_progress'
  });
  if (existingAttempt) {
    await autoSubmitIfExpired(existingAttempt);
    return res.status(200).json({
      success: true,
      data: {
        attempt: sanitizeAttempt(existingAttempt, { includeToken: true }),
        questions: sanitizeQuestions(existingAttempt.questionSnapshots)
      }
    });
  }

  const previousAttempt = await TestAttempt.findOne({
    test: test._id,
    assignment: assignment._id,
    user: req.user._id,
    status: { $in: ['submitted', 'auto_submitted'] }
  });
  if (previousAttempt) {
    return res.status(403).json({
      success: false,
      message: 'You have already completed this test'
    });
  }

  const questionDocs = await TestQuestion.find({ _id: { $in: test.questions } });
  let questionList = [...questionDocs];
  if (test.shuffleQuestions) {
    questionList = shuffleArray(questionList);
  }

  const questionSnapshots = questionList.map((question) => {
    let options = question.options || [];
    let correctOptionIndex = null;
    if (question.type === 'MCQ') {
      if (test.shuffleOptions) {
        const optionWithIndex = options.map((opt, index) => ({ ...opt.toObject(), originalIndex: index }));
        const shuffled = shuffleArray(optionWithIndex);
        options = shuffled.map(opt => ({ text: opt.text }));
        correctOptionIndex = shuffled.findIndex(opt => opt.isCorrect);
      } else {
        correctOptionIndex = options.findIndex(opt => opt.isCorrect);
        options = options.map(opt => ({ text: opt.text }));
      }
    }

    return {
      questionId: question._id,
      type: question.type,
      text: question.text,
      options,
      marks: question.marks,
      correctOptionIndex
    };
  });

  const maxScore = questionSnapshots.reduce((total, q) => total + (q.marks || 0), 0);
  const expiresAt = new Date(Date.now() + test.durationMinutes * 60000);

  const attempt = await TestAttempt.create({
    test: test._id,
    assignment: assignment._id,
    user: req.user._id,
    attemptToken: crypto.randomBytes(24).toString('hex'),
    expiresAt,
    questionSnapshots,
    maxScore
  });

  res.status(201).json({
    success: true,
    data: {
      attempt: sanitizeAttempt(attempt, { includeToken: true }),
      questions: sanitizeQuestions(attempt.questionSnapshots)
    }
  });
};

// @desc    Get attempt
// @route   GET /api/test-attempts/:id
// @access  Permission: test.take
exports.getAttempt = async (req, res) => {
  const attempt = await TestAttempt.findById(req.params.id);
  if (!attempt) {
    return res.status(404).json({ success: false, message: 'Attempt not found' });
  }

  if (attempt.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not allowed' });
  }

  await autoSubmitIfExpired(attempt);
  res.status(200).json({
    success: true,
    data: {
      attempt: sanitizeAttempt(attempt, { includeToken: true }),
      questions: sanitizeQuestions(attempt.questionSnapshots)
    }
  });
};

// @desc    Submit attempt
// @route   POST /api/test-attempts/:id/submit
// @access  Permission: test.take
exports.submitAttempt = async (req, res) => {
  const { answers, attemptToken } = req.body;
  const attempt = await TestAttempt.findById(req.params.id);
  if (!attempt) {
    return res.status(404).json({ success: false, message: 'Attempt not found' });
  }

  if (attempt.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not allowed' });
  }

  if (attempt.attemptToken !== attemptToken) {
    return res.status(403).json({ success: false, message: 'Invalid attempt token' });
  }

  if (attempt.status !== 'in_progress') {
    return res.status(400).json({ success: false, message: 'Attempt already submitted' });
  }

  const mappedAnswers = (answers || []).map((answer) => ({
    questionId: answer.questionId,
    type: answer.type,
    selectedOptionIndex: typeof answer.selectedOptionIndex === 'number' ? answer.selectedOptionIndex : null,
    answerText: answer.answerText || ''
  }));

  attempt.answers = mappedAnswers;
  attempt.status = new Date() > attempt.expiresAt ? 'auto_submitted' : 'submitted';
  attempt.submittedAt = new Date();
  evaluateAttempt(attempt);
  await attempt.save();

  res.status(200).json({ success: true, data: sanitizeAttempt(attempt, { includeToken: true }) });
};

// @desc    Log violation
// @route   POST /api/test-attempts/:id/violations
// @access  Permission: test.take
exports.logViolation = async (req, res) => {
  const { attemptToken, type, details } = req.body;
  const attempt = await TestAttempt.findById(req.params.id);
  if (!attempt) {
    return res.status(404).json({ success: false, message: 'Attempt not found' });
  }

  if (attempt.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not allowed' });
  }

  if (attempt.attemptToken !== attemptToken) {
    return res.status(403).json({ success: false, message: 'Invalid attempt token' });
  }

  attempt.violations.push({
    type,
    details: details || '',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] || ''
  });

  await attempt.save();

  const test = await Test.findById(attempt.test);
  const threshold = test?.violationThreshold ?? 3;
  if (threshold >= 0 && attempt.violations.length >= threshold && attempt.status === 'in_progress') {
    attempt.status = 'auto_submitted';
    attempt.submittedAt = new Date();
    evaluateAttempt(attempt);
    await attempt.save();
  }

  res.status(200).json({ success: true, data: sanitizeAttempt(attempt, { includeToken: true }) });
};

// @desc    List my attempts
// @route   GET /api/test-attempts/my
// @access  Permission: test.take
exports.getMyAttempts = async (req, res) => {
  const attempts = await TestAttempt.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .populate('test', 'title durationMinutes');
  const sanitized = attempts.map((attempt) => sanitizeAttempt(attempt, { includeToken: false }));
  res.status(200).json({ success: true, data: sanitized });
};

// @desc    List attempts for evaluation
// @route   GET /api/test-attempts/evaluate
// @access  Permission: test.evaluate
exports.getAttemptsForEvaluation = async (req, res) => {
  const attempts = await TestAttempt.find({ status: { $in: ['submitted', 'auto_submitted'] } })
    .sort({ createdAt: -1 })
    .populate('user', 'fullName email')
    .populate('test', 'title');
  const sanitized = attempts.map((attempt) => sanitizeAttempt(attempt, { includeToken: false }));
  res.status(200).json({ success: true, data: sanitized });
};

// @desc    Evaluate descriptive answers
// @route   POST /api/test-attempts/:id/evaluate
// @access  Permission: test.evaluate
exports.evaluateAttempt = async (req, res) => {
  const { answers, evaluationNotes } = req.body;
  const attempt = await TestAttempt.findById(req.params.id);
  if (!attempt) {
    return res.status(404).json({ success: false, message: 'Attempt not found' });
  }

  if (!Array.isArray(answers)) {
    return res.status(400).json({ success: false, message: 'Answers are required' });
  }

  answers.forEach((answer) => {
    const existing = attempt.answers.find(a => a.questionId.toString() === answer.questionId);
    if (existing && existing.type === 'DESCRIPTIVE') {
      existing.marksAwarded = Number(answer.marksAwarded || 0);
      existing.feedback = answer.feedback || '';
    }
  });

  attempt.evaluatedBy = req.user._id;
  attempt.evaluationNotes = evaluationNotes || '';
  evaluateAttempt(attempt);
  await attempt.save();

  res.status(200).json({ success: true, data: sanitizeAttempt(attempt, { includeToken: false }) });
};
