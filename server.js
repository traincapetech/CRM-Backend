const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const cors = require("cors");
const connectDB = require("./config/db");
const {
  corsMiddleware,
  ensureCorsHeaders,
  handleOptions,
} = require("./middleware/cors");
const ipFilter = require("./middleware/ipFilter");
const http = require("http");
const socketIo = require("socket.io");
const {
  seedDefaultEmailTemplates,
} = require("./utils/seedDefaultEmailTemplates");
const { seedAccessRoles } = require("./utils/seedAccessRoles");

// Load env vars
dotenv.config();

// Validate environment variables (CRITICAL SECURITY)
const validateEnvironment = require("./utils/validateEnv");
validateEnvironment();

// Connect to database
console.log("Connecting to CRM database...");
connectDB();
seedDefaultEmailTemplates();
seedAccessRoles();

// Connect to Redis (optional - for caching)
const { connectRedis } = require("./config/redis");
connectRedis();

// Initialize Email Queue (if Redis is available)
const { initEmailQueue } = require("./services/emailQueue");
try {
  initEmailQueue();
} catch (error) {
  console.warn(
    "⚠️ Email queue not initialized (Redis may not be available):",
    error.message,
  );
  console.log("📧 Emails will be sent synchronously (fallback mode)");
}

// Use the IP filter middleware
// app.use(ipFilter);

// Route files
const authRoutes = require("./routes/auth");
const leadRoutes = require("./routes/leads");
const salesRoutes = require("./routes/sales");
const leadSalesRoutes = require("./routes/leadSalesRoute");
const leadPersonSalesRoutes = require("./routes/leadPersonSales");
const currencyRoutes = require("./routes/currency");
const tasksRoutes = require("./routes/tasks");
const testExamRoutes = require("./routes/testExamNotifications");
const chatRoutes = require("./routes/chat");
const prospectRoutes = require("./routes/prospects");
const activityRoutes = require("./routes/activity");
const employeeRoutes = require("./routes/employees");
const leaveRoutes = require("./routes/leaves");
const attendanceRoutes = require("./routes/attendance");
const payrollRoutes = require("./routes/payroll");
const incentivesRoutes = require("./routes/incentives");
const documentationRoutes = require("./routes/documentation");
const invoiceRoutes = require("./routes/invoices");
const stripeInvoiceRoutes = require("./routes/stripeInvoices");
const logs = require("./routes/logs");
const itProjectsRoutes = require("./routes/itProjects");
const emailCampaignRoutes = require("./routes/emailCampaigns");
const emailTemplateRoutes = require("./routes/emailTemplates");
const workflowRoutes = require("./routes/workflows");
const payoutRoutes = require("./routes/payouts");
const paytmRoutes = require("./routes/paytm");
const biometricRoutes = require("./routes/biometric");
const testRolesRoutes = require("./routes/testRoles");
const testGroupsRoutes = require("./routes/testGroups");
const testQuestionsRoutes = require("./routes/testQuestions");
const testsRoutes = require("./routes/tests");
const testAssignmentsRoutes = require("./routes/testAssignments");
const testAttemptsRoutes = require("./routes/testAttempts");
const testReportsRoutes = require("./routes/testReports");
const feedRoutes = require("./routes/feed");
const journeyRoutes = require("./routes/journeys");
const searchRoutes = require("./routes/search");
const app = express();
const server = http.createServer(app);

// Trust proxy headers (Render/NGINX) for correct client IP in rate limiting
app.set("trust proxy", 1);

// Make app available to other modules
module.exports.app = app;

// Socket.IO setup with CORS
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://traincapecrm.traincapetech.in",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Make io available to other modules
app.set("io", io);
module.exports.io = io;

// Chat service for Socket.IO
const ChatService = require("./services/chatService");

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Check if this is a guest connection
  const isGuest = socket.handshake.query.isGuest === "true";
  const guestId = socket.handshake.query.guestId;

  if (isGuest) {
    console.log("Guest connected:", guestId);

    // Handle guest joining their room
    socket.on("join-guest-room", (guestId) => {
      socket.join(`guest-${guestId}`);
      console.log(`Guest ${guestId} joined their room`);
    });

    // Handle guest requesting support team
    socket.on("get-support-team", async () => {
      try {
        const User = require("./models/User");
        const supportTeam = await User.find({
          role: { $in: ["Admin", "Manager", "Sales Person", "Lead Person"] },
          chatStatus: "ONLINE",
        }).select("fullName role chatStatus");

        socket.emit("support-team-list", supportTeam);
      } catch (error) {
        console.error("Error getting support team:", error);
      }
    });

    // Handle guest messages
    socket.on("guest-message", async (data) => {
      try {
        const { guestId, guestInfo, recipientId, content, timestamp } = data;

        // Create a guest message object
        const guestMessage = {
          id: Date.now(),
          guestId,
          guestInfo,
          content,
          timestamp,
          sender: "guest",
        };

        // Send to support team member
        if (recipientId !== "offline") {
          io.to(`user-${recipientId}`).emit("guest-message-received", {
            ...guestMessage,
            sender: "guest",
            senderName: guestInfo.name,
            senderEmail: guestInfo.email,
          });

          // Send notification
          io.to(`user-${recipientId}`).emit("messageNotification", {
            senderId: guestId,
            senderName: `${guestInfo.name} (Guest)`,
            content: content,
            timestamp: timestamp,
            isGuest: true,
          });
        }

        // Confirm message received
        socket.emit("guest-message-sent", guestMessage);
      } catch (error) {
        console.error("Error handling guest message:", error);
        socket.emit("guest-message-error", { error: error.message });
      }
    });

    // Handle support team responding to guest
    socket.on("respond-to-guest", (data) => {
      const { guestId, content, senderName, timestamp } = data;

      io.to(`guest-${guestId}`).emit("guest-message-received", {
        id: Date.now(),
        content,
        sender: "support",
        senderName,
        timestamp: new Date(timestamp),
      });
    });
  } else {
    // Regular user connection handling

    // Join user to their personal room for targeted notifications
    socket.on("join-user-room", (userId) => {
      socket.join(`user-${userId}`);
      console.log(`User ${userId} joined their room`);

      // Update user status to online
      ChatService.updateUserStatus(userId, "ONLINE").catch(console.error);

      // Broadcast user status update
      socket.broadcast.emit("userStatusUpdate", {
        userId,
        status: "ONLINE",
        lastSeen: new Date(),
      });
    });

    // Handle chat message sending via Socket.IO
    socket.on("sendMessage", async (data) => {
      try {
        const { senderId, recipientId, content, messageType = "text" } = data;

        const message = await ChatService.saveMessage({
          senderId,
          recipientId,
          content,
          messageType,
        });

        // Send to recipient
        io.to(`user-${recipientId}`).emit("newMessage", {
          _id: message._id,
          chatId: message.chatId,
          senderId: message.senderId,
          recipientId: message.recipientId,
          content: message.content,
          messageType: message.messageType,
          timestamp: message.timestamp,
          isRead: message.isRead,
        });

        // Send confirmation to sender
        socket.emit("messageDelivered", {
          _id: message._id,
          timestamp: message.timestamp,
        });

        // Send notification to recipient
        io.to(`user-${recipientId}`).emit("messageNotification", {
          senderId: message.senderId,
          senderName: message.senderId.fullName,
          content: message.content,
          timestamp: message.timestamp,
        });
      } catch (error) {
        console.error("Error sending message via socket:", error);
        socket.emit("messageError", { error: error.message });
      }
    });

    // Handle typing indicators
    socket.on("typing", (data) => {
      const { recipientId, isTyping } = data;
      io.to(`user-${recipientId}`).emit("userTyping", {
        senderId: data.senderId,
        isTyping,
      });
    });

    // Handle user status updates
    socket.on("updateStatus", async (data) => {
      try {
        const { userId, status } = data;
        await ChatService.updateUserStatus(userId, status);

        // Broadcast status update to all users
        io.emit("userStatusUpdate", {
          userId,
          status,
          lastSeen: new Date(),
        });
      } catch (error) {
        console.error("Error updating user status:", error);
      }
    });
  }

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Note: We can't easily get userId from socket on disconnect
    // This would need to be handled by storing userId in socket data
    // For now, we'll rely on the frontend to send status updates
  });
});

// Reminder service
const { processExamReminders } = require("./utils/reminderService");
const {
  startExamNotificationScheduler,
} = require("./utils/examNotificationService");
const { startBiometricScheduler } = require("./services/biometricScheduler");

// Security middleware
const helmet = require("helmet");
const xss = require("xss-clean");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const compression = require("compression");

// Body parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Cookie parser for JWT cookies
app.use(cookieParser());

// Compression middleware - reduces response size by ~70%
app.use(
  compression({
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6, // Balanced compression level
  }),
);

// Set security HTTP headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          process.env.CLIENT_URL || "http://localhost:5173",
        ],
        fontSrc: ["'self'", "https:", "data:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// Prevent XSS attacks
app.use(xss());

// Prevent NoSQL injection
app.use(mongoSanitize());

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Enable CORS with our custom middleware
app.use(corsMiddleware);

// Add a pre-flight route handler for OPTIONS requests
app.options("*", handleOptions);

// IP Filter - Restrict access to office network only
// Enable via ENABLE_IP_FILTER=true and configure ALLOWED_IP_RANGES in .env
app.use(ipFilter);

// Add second layer of CORS protection to ensure headers are set
app.use(ensureCorsHeaders);

// Add a specific route for CORS preflight that always succeeds
app.options("/api/*", handleOptions);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  // Skip rate limiting for logs endpoint (critical for debugging and monitoring)
  skip: (req) => {
    return (
      req.path.startsWith("/logs") || req.originalUrl.startsWith("/api/logs")
    );
  },
});
app.use("/api/", limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message:
    "Too many authentication attempts, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

// Apply strict rate limiting to all sensitive auth endpoints
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/auth/verify-email", authLimiter);
app.use("/api/auth/verify-2fa", authLimiter);
app.use("/api/auth/enable-2fa", authLimiter);

// IP Filter - Restrict access to office network only
// Enable via ENABLE_IP_FILTER=true and configure ALLOWED_IP_RANGES in .env
app.use(ipFilter);

// API Documentation (Swagger) - Only in development or if enabled
if (
  process.env.NODE_ENV === "development" ||
  process.env.ENABLE_API_DOCS === "true"
) {
  const swaggerSetup = require("./config/swagger");
  swaggerSetup(app);
}

// Serve static files from uploads directory
app.use("/uploads", express.static("uploads"));

// Mount routers
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/lead-sales", leadSalesRoutes);
app.use("/api/lead-person-sales", leadPersonSalesRoutes);
app.use("/api/currency", currencyRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/test-exam", testExamRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/prospects", prospectRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/payouts", payoutRoutes);
app.use("/api/paytm", paytmRoutes);
app.use("/api/incentives", incentivesRoutes);
app.use("/api/documentation", documentationRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/stripe-invoices", stripeInvoiceRoutes);
app.use("/api/logs", logs);
app.use("/api/it-projects", itProjectsRoutes);
app.use("/api/email-campaigns", emailCampaignRoutes);
app.use("/api/email-templates", emailTemplateRoutes);
app.use("/api/workflows", workflowRoutes);
app.use("/api/test-roles", testRolesRoutes);
app.use("/api/test-groups", testGroupsRoutes);
app.use("/api/test-questions", testQuestionsRoutes);
app.use("/api/tests", testsRoutes);
app.use("/api/test-assignments", testAssignmentsRoutes);
app.use("/api/test-attempts", testAttemptsRoutes);
app.use("/api/test-reports", testReportsRoutes);
app.use("/api/biometric", biometricRoutes);
app.use("/api/feed", feedRoutes); // Mount Feed Routes
app.use("/api/journeys", journeyRoutes); // Mount Journey Routes
app.use("/api/search", searchRoutes); // Mount Search Routes

// Basic route for testing
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to CRM API",
    environment: process.env.NODE_ENV,
    version: "1.0.0",
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handling middleware (with CORS headers)
app.use((err, req, res, next) => {
  console.error("Error:", err.message);

  // Set CORS headers even on errors to ensure frontend can receive error responses
  const origin = req.headers.origin;
  const envAllowedOrigins = [
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    process.env.ALLOWED_ORIGINS,
  ]
    .filter(Boolean)
    .flatMap((value) => value.split(",").map((origin) => origin.trim()))
    .filter(Boolean);

  const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://traincapecrm.traincapetech.in",
    "http://traincapecrm.traincapetech.in",
    "https://crm-backend-o36v.onrender.com",
    ...envAllowedOrigins,
  ];

  // Always set CORS headers for allowed origins or in development
  const isTraincapeSubdomain = origin
    ? /^https?:\/\/([a-z0-9-]+\.)?traincapetech\.in$/i.test(origin)
    : false;

  if (
    !origin ||
    allowedOrigins.includes(origin) ||
    isTraincapeSubdomain ||
    process.env.NODE_ENV === "development"
  ) {
    res.header("Access-Control-Allow-Origin", origin || "*");
    res.header(
      "Access-Control-Allow-Methods",
      "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Origin, X-Requested-With, Accept",
    );
    res.header("Access-Control-Allow-Credentials", "true");
  }

  if (err.name === "UnauthorizedError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }

  // Handle CORS errors specifically
  if (err.message && err.message.includes("CORS")) {
    return res.status(403).json({
      success: false,
      message: "CORS policy: Origin not allowed",
      origin: origin,
    });
  }

  res.status(500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);

  // Start the exam notification scheduler
  startExamNotificationScheduler(io);
  startBiometricScheduler();
});

// Set up the reminder scheduler - run every 10 minutes
const REMINDER_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds
setInterval(() => {
  console.log("Running exam reminder scheduler...");
  processExamReminders(io);
}, REMINDER_INTERVAL);

// Also run once at startup
console.log("Initial run of exam reminder scheduler...");
processExamReminders(io);

// Handle unhandled promise rejections
process.on("unhandledRejection", (err, promise) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});
