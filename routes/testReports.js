const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const { getOverview } = require('../controllers/testReports');

router.use(protect);
router.get('/overview', requirePermissions('test.report'), getOverview);

module.exports = router;
