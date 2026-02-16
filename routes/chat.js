const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure storage
const uploadDir = path.join(__dirname, "../uploads/chat");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "chat-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    // Accept images, videos, audio, and common documents
    if (
      file.mimetype.match(
        /^(image\/|video\/|audio\/|application\/pdf|application\/msword|application\/vnd.openxmlformats-officedocument.wordprocessingml.document|text\/plain)/,
      )
    ) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"), false);
    }
  },
});

const {
  sendMessage,
  getChatMessages,
  getChatRooms,
  getOnlineUsers,
  getAllUsersForChat,
  updateChatStatus,
  markMessagesAsRead,
  uploadAttachment,
} = require("../controllers/chatController");

const { protect } = require("../middleware/auth");

// All routes require authentication
router.use(protect);

// File upload route
router.post("/upload", upload.single("file"), uploadAttachment);

// Message routes
router.post("/messages", sendMessage);
router.get("/messages/:recipientId", getChatMessages);
router.put("/messages/read/:senderId", markMessagesAsRead);

// Chat room routes
router.get("/rooms", getChatRooms);

// User routes
router.get("/users", getAllUsersForChat);
router.get("/users/online", getOnlineUsers);
router.put("/status", updateChatStatus);

module.exports = router;
