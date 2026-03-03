const express = require('express');
const router = express.Router();
const controller = require('../controllers/ticket');
const { protect } = require('../middleware/auth');

const { uploadMiddleware } = require('../services/fileStorageService');

router.post('/', protect, uploadMiddleware.array('attachments'), controller.createTicket);
router.get('/', protect, controller.getAllTickets);
router.get('/stats', protect, controller.getTicketStats);
router.get('/:id', protect, controller.getTicketById);
router.get('/:id/chat', protect, controller.getTicketChat);
router.post('/chat/upload', protect, uploadMiddleware.array('attachments'), controller.uploadChatAttachments);

router.put('/:id/assign', protect, controller.assignTicket);
router.put('/:id/start', protect, controller.startProgress);
router.put('/:id/resolve', protect, controller.resolveTicket);
router.put('/:id/close', protect, controller.closeTicket);
router.put('/:id/reopen', protect, controller.reopenTicket);

router.delete('/:id', protect, controller.deleteTicket);

module.exports = router;
