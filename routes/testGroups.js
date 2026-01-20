const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const { getGroups, createGroup, updateGroup, deleteGroup } = require('../controllers/testGroups');

router.use(protect);
router.use(requirePermissions('test.manage_groups'));

router.get('/', getGroups);
router.post('/', createGroup);
router.put('/:id', updateGroup);
router.delete('/:id', deleteGroup);

module.exports = router;
