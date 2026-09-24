const express = require('express');
const router = express.Router();
const {
  getSaleCollections,
  assignCollection,
  reassignCollection,
  recordCollectionPayment,
  getCollectionPerformance,
  getUserActiveCollections,
  bulkReassignUser,
  getBulkPreview,
  bulkAssignSalesPersonPending,
  bulkAssignSelectedSales,
} = require('../controllers/collectionController');
const { protect } = require('../middleware/auth');

// All collection routes require authentication
router.use(protect);

router.get('/performance', getCollectionPerformance);
router.get('/bulk-preview', getBulkPreview);
router.get('/sale/:saleId', getSaleCollections);
router.post('/assign', assignCollection);
router.post('/reassign', reassignCollection);
router.post('/record-payment', recordCollectionPayment);
router.get('/user/:userId/active', getUserActiveCollections);
router.post('/bulk-reassign', bulkReassignUser);
router.post('/bulk-assign-salesperson', bulkAssignSalesPersonPending);
router.post('/bulk-assign-selected', bulkAssignSelectedSales);

module.exports = router;
