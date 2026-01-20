const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const { getAssignments, createAssignment, getAssignedForUser, getAssignment } = require('../controllers/testAssignments');

router.use(protect);

router.get('/assigned', requirePermissions('test.take'), getAssignedForUser);
router.get('/', requirePermissions('test.assign'), getAssignments);
router.get('/:id', requirePermissions('test.assign'), getAssignment);
router.post('/', requirePermissions('test.assign'), createAssignment);

module.exports = router;
