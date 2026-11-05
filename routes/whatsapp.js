const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  getStatus,
  getQRCode,
  startSession,
  sendTestMessage,
  sendLeadWelcome,
  sendInvoice,
} = require("../controllers/whatsapp");

// All routes require authentication
router.use(protect);

router.get("/status", authorize("Admin", "Manager"), getStatus);
router.get("/qr", authorize("Admin"), getQRCode);
router.post("/start", authorize("Admin"), startSession);
router.post("/send-test", authorize("Admin"), sendTestMessage);

// Lead and Invoice WhatsApp actions (available to Sales Persons, Managers, and Admins)
router.post(
  "/send-lead/:id",
  authorize("Admin", "Manager", "Sales Person", "Lead Person"),
  sendLeadWelcome
);
router.post(
  "/send-invoice/:id",
  authorize("Admin", "Manager", "Sales Person"),
  sendInvoice
);

module.exports = router;

