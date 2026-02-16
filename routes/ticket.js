const express = require('express');
const router = express.Router();
const controller = require('../controllers/ticket');
const { protect } = require('../middleware/auth');

router.post('/', protect, controller.createTicket);
router.get('/', protect, controller.getAllTickets);
router.get('/:id', protect, controller.getTicketById);

router.put('/:id/assign', protect, controller.assignTicket);
router.put('/:id/start', protect, controller.startProgress);
router.put('/:id/resolve', protect, controller.resolveTicket);
router.put('/:id/close', protect, controller.closeTicket);
router.put('/:id/reopen', protect, controller.reopenTicket);

router.delete('/:id', protect, controller.deleteTicket);

module.exports = router;
