const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const { getQuestions, createQuestion, updateQuestion, deleteQuestion } = require('../controllers/testQuestions');

router.use(protect);
router.use(requirePermissions('test.create'));

router.get('/', getQuestions);
router.post('/', createQuestion);
router.put('/:id', updateQuestion);
router.delete('/:id', deleteQuestion);

module.exports = router;
