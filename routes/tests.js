const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const { getTests, getTest, createTest, updateTest, deleteTest } = require('../controllers/tests');

router.use(protect);

router.get('/', requirePermissions('test.create', 'test.assign', 'test.report'), getTests);
router.get('/:id', requirePermissions('test.create', 'test.assign', 'test.report'), getTest);
router.post('/', requirePermissions('test.create'), createTest);
router.put('/:id', requirePermissions('test.create'), updateTest);
router.delete('/:id', requirePermissions('test.create'), deleteTest);

module.exports = router;
