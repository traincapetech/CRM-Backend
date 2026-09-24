const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const { getRoles, createRole, updateRole, deleteRole } = require('../controllers/testRoles');

router.use(protect);
router.use(requirePermissions('test.manage_roles'));

router.get('/', getRoles);
router.post('/', createRole);
router.put('/:id', updateRole);
router.delete('/:id', deleteRole);

module.exports = router;
