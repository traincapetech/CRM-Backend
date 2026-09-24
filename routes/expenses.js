const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const {
  createExpense,
  getExpenses,
  updateExpenseStatus,
  deleteExpense,
} = require("../controllers/expense");

const router = express.Router();

// Middleware to handle file uploads
const multer = require("multer");
const { UPLOAD_PATHS } = require("../config/storage");
const path = require("path");
const fs = require("fs");

// Ensure upload directory exists
const uploadDir =
  UPLOAD_PATHS.EXPENSES || path.join(__dirname, "../uploads/expenses");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|pdf/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase(),
    );

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Error: File upload only supports images and PDFs!"));
  },
});

router
  .route("/")
  .get(protect, getExpenses)
  .post(protect, upload.array("attachments", 5), createExpense);

router.route("/:id").delete(protect, deleteExpense);

router
  .route("/:id/status")
  .patch(
    protect,
    authorize("Admin", "Manager", "HR", "IT Manager"),
    updateExpenseStatus,
  );

module.exports = router;
