const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const {
  startAttempt,
  getAttempt,
  getAttemptReview,
  submitAttempt,
  logViolation,
  getMyAttempts,
  getAttemptsForEvaluation,
  evaluateAttempt
} = require('../controllers/testAttempts');

router.use(protect);

router.post('/start', requirePermissions('test.take'), startAttempt);
router.get('/my', requirePermissions('test.take'), getMyAttempts);
router.get('/evaluate', requirePermissions('test.evaluate'), getAttemptsForEvaluation);
router.get('/:id/review', requirePermissions('test.take'), getAttemptReview);
router.get('/:id', requirePermissions('test.take'), getAttempt);
router.post('/:id/submit', requirePermissions('test.take'), submitAttempt);
router.post('/:id/violations', requirePermissions('test.take'), logViolation);
router.post('/:id/evaluate', requirePermissions('test.evaluate'), evaluateAttempt);

module.exports = router;
