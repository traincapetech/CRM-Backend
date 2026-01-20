const TestAssignment = require('../models/TestAssignment');
const TestUserGroup = require('../models/TestUserGroup');
const Test = require('../models/Test');
const { getUserRoleNames } = require('../utils/rbac');

const isAssignmentActive = (assignment) => {
  if (!assignment.isActive) return false;
  const now = new Date();
  if (assignment.startAt && now < assignment.startAt) return false;
  if (assignment.endAt && now > assignment.endAt) return false;
  return true;
};

const assignmentMatchesUser = async (assignment, userId, roleNames) => {
  if (assignment.assignedToUsers?.some(u => u.toString() === userId.toString())) {
    return true;
  }
  if (assignment.assignedToRoles?.some(role => roleNames.includes(role))) {
    return true;
  }
  if (assignment.assignedToGroups?.length) {
    const groups = await TestUserGroup.find({
      _id: { $in: assignment.assignedToGroups },
      members: userId,
      isActive: true
    }).select('_id');
    return groups.length > 0;
  }
  return false;
};

// @desc    List assignments
// @route   GET /api/test-assignments
// @access  Permission: test.assign
exports.getAssignments = async (req, res) => {
  const assignments = await TestAssignment.find({})
    .sort({ createdAt: -1 })
    .populate('test', 'title durationMinutes')
    .populate('assignedBy', 'fullName email');

  res.status(200).json({ success: true, data: assignments });
};

// @desc    Create assignment
// @route   POST /api/test-assignments
// @access  Permission: test.assign
exports.createAssignment = async (req, res) => {
  const { testId, assignedToUsers, assignedToRoles, assignedToGroups, startAt, endAt } = req.body;

  const test = await Test.findById(testId);
  if (!test) {
    return res.status(404).json({ success: false, message: 'Test not found' });
  }

  const assignment = await TestAssignment.create({
    test: testId,
    assignedBy: req.user._id,
    assignedToUsers: Array.isArray(assignedToUsers) ? assignedToUsers : [],
    assignedToRoles: Array.isArray(assignedToRoles) ? assignedToRoles : [],
    assignedToGroups: Array.isArray(assignedToGroups) ? assignedToGroups : [],
    startAt: startAt || null,
    endAt: endAt || null
  });

  res.status(201).json({ success: true, data: assignment });
};

// @desc    Get assignments for current user
// @route   GET /api/test-assignments/assigned
// @access  Permission: test.take
exports.getAssignedForUser = async (req, res) => {
  const roleNames = getUserRoleNames(req.user);
  const assignments = await TestAssignment.find({ isActive: true })
    .populate('test')
    .sort({ createdAt: -1 });

  const filtered = [];
  for (const assignment of assignments) {
    if (!isAssignmentActive(assignment)) continue;
    // eslint-disable-next-line no-await-in-loop
    const matches = await assignmentMatchesUser(assignment, req.user._id, roleNames);
    if (matches) {
      filtered.push(assignment);
    }
  }

  res.status(200).json({ success: true, data: filtered });
};

// @desc    Get assignment by id
// @route   GET /api/test-assignments/:id
// @access  Permission: test.assign
exports.getAssignment = async (req, res) => {
  const assignment = await TestAssignment.findById(req.params.id)
    .populate('test')
    .populate('assignedBy', 'fullName email');

  if (!assignment) {
    return res.status(404).json({ success: false, message: 'Assignment not found' });
  }
  res.status(200).json({ success: true, data: assignment });
};

module.exports.assignmentMatchesUser = assignmentMatchesUser;
module.exports.isAssignmentActive = isAssignmentActive;
