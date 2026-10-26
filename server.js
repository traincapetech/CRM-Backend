// Default the process timezone to IST so day boundaries (performance, attendance) are correct on UTC hosts
if (!process.env.TZ) process.env.TZ = "Asia/Kolkata";

// Force IPv4 DNS resolution first to prevent ENETUNREACH errors on IPv6-only/restricted environments (e.g. Render)
const dns = require("dns");
if (dns && typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

// Global Mongoose Audit Log Plugin registration prior to schema loading
const mongoose = require("mongoose");
const auditLogPlugin = require("./plugins/auditLogPlugin");
mongoose.plugin(auditLogPlugin);

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
const chatSocketHandler = require("./sockets/chatSocket");
const ticketSocketHandler = require("./sockets/ticketSocket");
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

// Initialize Performance Queue (if Redis is available)
const { initPerformanceQueue } = require("./services/performanceQueue");
try {
  initPerformanceQueue();
} catch (error) {
  console.warn(
    "⚠️ Performance queue not initialized (Redis may not be available):",
    error.message,
  );
  console.log("📊 Performance calculations will be run synchronously (fallback mode)");
}


// Initialize Performance Management Cron Jobs
const PerformanceCronJobs = require("./services/performanceCronJobs");
try {
  PerformanceCronJobs.startAll();
} catch (error) {
  console.warn("⚠️ Performance cron jobs not initialized:", error.message);
}

// Initialize Onboarding Cron Jobs
const OnboardingCronJobs = require("./services/onboardingCronJobs");
try {
  OnboardingCronJobs.startAll();
} catch (error) {
  console.warn("⚠️ Onboarding cron jobs not initialized:", error.message);
}

// Initialize Payout Scheduling & Due Date Cron Jobs
const PayoutCronJobs = require("./services/payoutCronJobs");
try {
  PayoutCronJobs.startAll();
} catch (error) {
  console.warn("⚠️ Payout cron jobs not initialized:", error.message);
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
const questionnaireRoutes = require("./routes/questionnaireRoutes");
const payoutRoutes = require("./routes/payouts");
const paytmRoutes = require("./routes/paytm");
const biometricRoutes = require("./routes/biometric");
const performanceRoutes = require("./routes/performance");
const reviewRoutes = require("./routes/reviews");
const promotionRoutes = require("./routes/promotions");
const incrementRoutes = require("./routes/increments");
const assetRoutes = require("./routes/assets");
const expenseRoutes = require("./routes/expenses");
const advanceRoutes = require("./routes/advances");
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
const ticketRoutes = require("./routes/ticket");
const departmentRoutes = require("./routes/department");
const notificationRoutes = require("./routes/notifications");
const quarterlyIncentivesRoutes = require("./routes/quarterlyIncentives");
const holidayRoutes = require("./routes/holidays");
const holidayController = require("./controllers/holidays");
const courseRoutes = require("./routes/courses");
const kpiBreakdownRoutes = require("./routes/kpiBreakdown");
const verdaEnquiryRoutes = require("./routes/verdaEnquiry");
const meetingRoutes = require("./routes/meetings");
const officeNetworkRoutes = require("./routes/officeNetwork");
const onboardingRoutes = require("./routes/onboarding");
const exitRoutes = require("./routes/exits");
const branchRoutes = require("./routes/branches");
const branchAnalyticsRoutes = require("./routes/branchAnalytics");
const collectionRoutes = require("./routes/collectionRoutes");
const dashboardRoutes = require("./routes/dashboard");

const app = express();
const server = http.createServer(app);

// Trust proxy headers (Render/NGINX/Cloudflare)
const trustProxy = process.env.TRUST_PROXY === "true" 
  ? true 
  : Number(process.env.TRUST_PROXY || 1);
app.set("trust proxy", trustProxy);

// Make app available to other modules
module.exports.app = app;

// Socket.IO setup with CORS
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://verdaexports.com",
      "http://localhost:5173",
      "https://traincapecrm.traincapetech.in",
      "http://traincapecrm.traincapetech.in"
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Make io accessible to routers/controllers
app.set("io", io);

// Initialize notification service with shared io instance
const notificationService = require("./services/notificationService");
notificationService.init(io);

// // Make io available to other modules


//     // Handle guest joining their room
//     socket.on("join-guest-room", (guestId) => {
//       socket.join(`guest-${guestId}`);
//       console.log(`Guest ${guestId} joined their room`);
//     });

//     // Handle guest requesting support team
//     socket.on("get-support-team", async () => {
//       try {
//         const User = require("./models/User");
//         const supportTeam = await User.find({
//           role: { $in: ["Admin", "Manager", "Sales Person", "Lead Person"] },
//           chatStatus: "ONLINE",
//         }).select("fullName role chatStatus");

//         socket.emit("support-team-list", supportTeam);
//       } catch (error) {
//         console.error("Error getting support team:", error);
//       }
//     });

//     // Handle guest messages
//     socket.on("guest-message", async (data) => {
//       try {
//         const { guestId, guestInfo, recipientId, content, timestamp } = data;

//         // Create a guest message object
//         const guestMessage = {
//           id: Date.now(),
//           guestId,
//           guestInfo,
//           content,
//           timestamp,
//           sender: "guest",
//         };

//         // Send to support team member
//         if (recipientId !== "offline") {
//           io.to(`user-${recipientId}`).emit("guest-message-received", {
//             ...guestMessage,
//             sender: "guest",
//             senderName: guestInfo.name,
//             senderEmail: guestInfo.email,
//           });

//           // Send notification
//           io.to(`user-${recipientId}`).emit("messageNotification", {
//             senderId: guestId,
//             senderName: `${guestInfo.name} (Guest)`,
//             content: content,
//             timestamp: timestamp,
//             isGuest: true,
//           });
//         }

//         // Confirm message received
//         socket.emit("guest-message-sent", guestMessage);
//       } catch (error) {
//         console.error("Error handling guest message:", error);
//         socket.emit("guest-message-error", { error: error.message });
//       }
//     });

//     // Handle support team responding to guest
//     socket.on("respond-to-guest", (data) => {
//       const { guestId, content, senderName, timestamp } = data;

//       io.to(`guest-${guestId}`).emit("guest-message-received", {
//         id: Date.now(),
//         content,
//         sender: "support",
//         senderName,
//         timestamp: new Date(timestamp),
//       });
//     });
//   } else {
//     // Regular user connection handling

//     // Join user to their personal room for targeted notifications
//     socket.on("join-user-room", (userId) => {
//       socket.join(`user-${userId}`);
//       console.log(`User ${userId} joined their room`);

//       // Update user status to online
//       ChatService.updateUserStatus(userId, "ONLINE").catch(console.error);

//       // Broadcast user status update
//       socket.broadcast.emit("userStatusUpdate", {
//         userId,
//         status: "ONLINE",
//         lastSeen: new Date(),
//       });
//     });

//     // Handle chat message sending via Socket.IO
//     socket.on("sendMessage", async (data) => {
//       try {
//         const { senderId, recipientId, content, messageType = "text" } = data;

//         const message = await ChatService.saveMessage({
//           senderId,
//           recipientId,
//           content,
//           messageType,
//         });

//         // Send to recipient
//         io.to(`user-${recipientId}`).emit("newMessage", {
//           _id: message._id,
//           chatId: message.chatId,
//           senderId: message.senderId,
//           recipientId: message.recipientId,
//           content: message.content,
//           messageType: message.messageType,
//           timestamp: message.timestamp,
//           isRead: message.isRead,
//         });

//         // Send confirmation to sender
//         socket.emit("messageDelivered", {
//           _id: message._id,
//           timestamp: message.timestamp,
//         });

//         // Send notification to recipient
//         io.to(`user-${recipientId}`).emit("messageNotification", {
//           senderId: message.senderId,
//           senderName: message.senderId.fullName,
//           content: message.content,
//           timestamp: message.timestamp,
//         });
//       } catch (error) {
//         console.error("Error sending message via socket:", error);
//         socket.emit("messageError", { error: error.message });
//       }
//     });

//     // Handle typing indicators
//     socket.on("typing", (data) => {
//       const { recipientId, isTyping } = data;
//       io.to(`user-${recipientId}`).emit("userTyping", {
//         senderId: data.senderId,
//         isTyping,
//       });
//     });

//     // Handle user status updates
//     socket.on("updateStatus", async (data) => {
//       try {
//         const { userId, status } = data;
//         await ChatService.updateUserStatus(userId, status);

//         // Broadcast status update to all users
//         io.emit("userStatusUpdate", {
//           userId,
//           status,
//           lastSeen: new Date(),
//         });
//       } catch (error) {
//         console.error("Error updating user status:", error);
//       }
//     });
//   }

//   socket.on("disconnect", () => {
//     console.log("User disconnected:", socket.id);

//     // Note: We can't easily get userId from socket on disconnect
//     // This would need to be handled by storing userId in socket data
//     // For now, we'll rely on the frontend to send status updates
//   });
// });

// Socket.IO IP Filter Middleware (Security Fix for Check 8)
io.use(async (socket, next) => {
  if (process.env.ENABLE_IP_FILTER !== "true") {
    return next();
  }

  try {
    const { isIPAllowed, normalizeIP } = require("./middleware/ipFilter");
    
    // Retrieve client IP under proxy (Render) from handshake headers
    const xForwardedFor = socket.handshake.headers["x-forwarded-for"];
    let clientIP = xForwardedFor ? xForwardedFor.split(",")[0].trim() : socket.handshake.address;
    clientIP = normalizeIP(clientIP);

    const { isAllowed, officeName } = await isIPAllowed(clientIP);

    if (isAllowed) {
      if (process.env.DEBUG_IP === "true" || process.env.NODE_ENV === "development") {
        console.log(`✅ Allowed Socket.IO connection: ${clientIP} | Office: ${officeName} | Socket ID: ${socket.id}`);
      }
      return next();
    }

    console.error(`🚫 Blocked Socket.IO connection attempt: ${clientIP} | Socket ID: ${socket.id}`);
    return next(new Error("IP_NOT_ALLOWED"));
  } catch (err) {
    console.error("❌ Socket.IO IP Filter error:", err);
    return next(new Error("INTERNAL_SERVER_ERROR"));
  }
});

// Socket.IO JWT Authentication Middleware
io.use(async (socket, next) => {
  try {
    const jwt = require("jsonwebtoken");
    const User = require("./models/User");

    // Extract token from auth payload, authorization headers, or query
    let token = socket.handshake.auth?.token;
    if (!token && socket.handshake.headers?.authorization) {
      const parts = socket.handshake.headers.authorization.split(" ");
      if (parts.length === 2 && parts[0] === "Bearer") {
        token = parts[1];
      }
    }
    if (!token && socket.handshake.query?.token) {
      token = socket.handshake.query.token;
    }

    if (token && process.env.JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");
        if (user) {
          socket.user = user;
          socket.userId = user._id.toString();
        }
      } catch (tokenErr) {
        console.warn(`Socket.IO Auth Warning: ${tokenErr.message}`);
      }
    }

    // Fallback: If connecting as desktop agent with query parameters
    if (!socket.user && socket.handshake.query?.isAgent === "true") {
      const queryUserId = socket.handshake.query?.userId;
      if (queryUserId) {
        try {
          const user = await User.findById(queryUserId).select("-password");
          if (user) {
            // SECURITY: Never allow unauthenticated query-param fallback to claim administrative/supervisory roles
            if (["Admin", "Super Admin", "Manager", "IT Manager"].includes(user.role)) {
              console.warn(
                `🚨 [SECURITY] Blocked unauthenticated attempt to claim privileged role via isAgent query fallback for userId: ${queryUserId}`
              );
            } else {
              socket.user = user;
              socket.userId = user._id.toString();
              socket.isAgent = true;
            }
          }
        } catch (e) {}
      }
    }

    return next();
  } catch (err) {
    console.error("Socket.IO Auth Middleware Error:", err);
    return next();
  }
});

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // 🔑 Critical: Allow clients to join their personal room for targeted notifications
  socket.on("join-user-room", (userId) => {
    // SECURITY: Strictly require authenticated socket
    if (!socket.userId) {
      console.warn(`🚨 [SECURITY] Blocked unauthenticated socket ${socket.id} from joining user room`);
      return;
    }

    // Only managerial users can observe other rooms; regular users are confined strictly to their own room
    const isManagerial = ["Admin", "Super Admin", "Manager"].includes(socket.user?.role);
    const targetUserId = isManagerial && userId ? userId.toString() : socket.userId.toString();
    const room = `user-${targetUserId}`;
    socket.join(room);
    console.log(`✅ User joined room: ${room} (socket: ${socket.id}, role: ${socket.user?.role || "unknown"})`);
  });

  // Initialize modular handlers
  chatSocketHandler(io, socket);
  ticketSocketHandler(io, socket);
  
  const screenShareSocketHandler = require("./handlers/screenShareSocketHandler");
  screenShareSocketHandler(io, socket);
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

// Body parser (restricted to 10mb for DoS prevention; multipart uploads handled by multer)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Cookie parser for JWT cookies
app.use(cookieParser());

// Request context middleware for Mongoose audit logging
const { contextMiddleware } = require("./middleware/context");
app.use(contextMiddleware);

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
          "http://localhost:3000",
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
  max: 1000, // limit each IP to 1000 requests per 15 minutes
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
app.use("/api/auth/reset_password", authLimiter);
app.use("/api/auth/verifyOtp", authLimiter);
app.use("/api/auth/verify-email", authLimiter);
app.use("/api/auth/2fa/validate", authLimiter);
app.use("/api/auth/2fa/verify", authLimiter);
app.use("/api/auth/verify-2fa", authLimiter);
app.use("/api/auth/enable-2fa", authLimiter);

// Rate limiting for public form submissions to prevent spam and disk exhaustion
const publicFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 submissions per 15 minutes
  message: "Too many requests submitted. Please try again after 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});
app.use("/api/public/project-request", publicFormLimiter);

// IP Filter already applied above

// API Documentation (Swagger) - Only in development or if enabled
if (
  process.env.NODE_ENV === "development" ||
  process.env.ENABLE_API_DOCS === "true"
) {
  const swaggerSetup = require("./config/swagger");
  swaggerSetup(app);
}

// Serve static files from uploads directory with CORS enabled
app.use("/uploads", cors(), express.static("uploads"));

// Mount routers
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/collections", collectionRoutes);
app.use("/api/lead-sales", leadSalesRoutes);
app.use("/api/lead-person-sales", leadPersonSalesRoutes);
app.use("/api/currency", currencyRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/test-exam", testExamRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/prospects", prospectRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/branch-analytics", branchAnalyticsRoutes);
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
app.use("/api/questionnaires", questionnaireRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use("/api/test-roles", testRolesRoutes);
app.use("/api/test-groups", testGroupsRoutes);
app.use("/api/test-questions", testQuestionsRoutes);
app.use("/api/tests", testsRoutes);
app.use("/api/test-assignments", testAssignmentsRoutes);
app.use("/api/test-attempts", testAttemptsRoutes);
app.use("/api/test-reports", testReportsRoutes);
app.use("/api/biometric", biometricRoutes);
app.use("/api/performance/kpi-breakdown", kpiBreakdownRoutes);
app.use("/api/performance", performanceRoutes); // Performance Management ERP
app.use("/api/reviews", reviewRoutes); // Enterprise Performance Review Engine HRMS V2
app.use("/api/promotions", promotionRoutes); // Promotion & Career Progression Engine HRMS V2
app.use("/api/increments", incrementRoutes); // Enterprise Salary Increment & Compensation Engine HRMS V2
app.use("/api/assets", assetRoutes); // Enterprise Asset Management HRMS V2
app.use("/api/exits", exitRoutes); // Enterprise Exit Management & FnF Settlement HRMS V2
app.use("/api/expenses", expenseRoutes); // Expense Reimbursement
app.use("/api/advances", advanceRoutes); // Employee Salary Advances
app.use("/api/feed", feedRoutes); // Mount Feed Routes
app.use("/api/journeys", journeyRoutes); // Mount Journey Routes
app.use("/api/search", searchRoutes); // Mount Search Routes
app.use("/api/tickets", ticketRoutes); // Mount Ticket Routes
app.use("/api/departments", departmentRoutes); // Mount Department Routes
app.use("/api/notifications", notificationRoutes); // Mount Notification Routes
app.use("/api/questionnaires", questionnaireRoutes); // Mount Questionnaire Routes

app.use("/api/holidays", holidayRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/public", require("./routes/public"));
app.use("/api/project-requests", require("./routes/projectRequirements"));
app.use("/api/quarterly-incentives", quarterlyIncentivesRoutes); // Mount Quarterly Incentives Routes
app.use("/api/verda-enquiries", verdaEnquiryRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/office-networks", officeNetworkRoutes);
app.use("/api/onboarding", onboardingRoutes);

// Image Proxy Route to solve CORS issues for ID Card generation (Hardened against SSRF)
const { protect } = require("./middleware/auth");
const path = require("path");
const fs = require("fs");

app.get("/api/proxy-image", protect, async (req, res) => {
  let imageUrl = req.query.url;
  if (!imageUrl || typeof imageUrl !== "string") {
    return res.status(400).json({ success: false, message: "URL is required" });
  }

  imageUrl = imageUrl.trim();

  // 1. Handle local relative paths directly from the filesystem (Zero network SSRF risk)
  if (imageUrl.startsWith("/")) {
    const safeBaseDir = path.resolve(__dirname);
    const allowedSubdirs = [
      path.join(safeBaseDir, "uploads"),
      path.join(safeBaseDir, "assets"),
    ];

    const cleanRelativePath = imageUrl.split("?")[0];
    const resolvedPath = path.resolve(safeBaseDir, `.${cleanRelativePath}`);

    const isAllowedDir = allowedSubdirs.some((dir) =>
      resolvedPath.startsWith(dir)
    );

    if (isAllowedDir && fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
      const ext = path.extname(resolvedPath).toLowerCase();
      const mimeTypes = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
      };
      const contentType = mimeTypes[ext] || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return fs.createReadStream(resolvedPath).pipe(res);
    }
  }

  // 2. Validate external URLs with strict domain whitelist & anti-SSRF protections
  try {
    const parsedUrl = new URL(imageUrl);

    // Enforce protocol strictly
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return res.status(400).json({ success: false, message: "Invalid URL protocol" });
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // Block private/loopback/cloud metadata IP ranges
    const isPrivateOrLoopback =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "169.254.169.254" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal");

    if (isPrivateOrLoopback) {
      return res.status(403).json({
        success: false,
        message: "Access to private or local addresses is prohibited",
      });
    }

    // Whitelist allowed external domains (R2 storage, corporate domains, Render host)
    let r2Host = "";
    if (process.env.Public_URL) {
      try {
        r2Host = new URL(process.env.Public_URL).hostname.toLowerCase();
      } catch {}
    }

    const currentHost = (req.get("host") || "").split(":")[0].toLowerCase();

    const isWhitelisted =
      (r2Host && hostname === r2Host) ||
      hostname.endsWith(".r2.dev") ||
      hostname.endsWith(".r2.cloudflarestorage.com") ||
      hostname === "traincapecrm.traincapetech.in" ||
      hostname.endsWith(".traincapetech.in") ||
      hostname === "crm-backend-o36v.onrender.com" ||
      hostname === currentHost;

    if (!isWhitelisted) {
      return res.status(403).json({
        success: false,
        message: "Fetching images from this external domain is not allowed",
      });
    }

    const axios = require("axios");
    // Explicitly DO NOT forward authorization or cookie headers to external destinations
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 5000,
      maxContentLength: 10 * 1024 * 1024, // 10MB limit
      headers: {
        "User-Agent": "Traincape-CRM-ImageProxy/1.0",
      },
    });

    const contentType = response.headers["content-type"] || "";
    if (!contentType.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "Target URL does not return an image",
      });
    }

    res.set("Content-Type", contentType);
    res.set("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.set("X-Content-Type-Options", "nosniff");
    res.send(response.data);
  } catch (error) {
    console.error("Proxy error:", error.message, "URL:", imageUrl);
    res.status(500).json({ success: false, message: "Error fetching image" });
  }
});

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
    process.env.VERDA_URL,
  ]
    .filter(Boolean)
    .flatMap((value) => value.split(",").map((origin) => origin.trim()))
    .filter(Boolean);

  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "https://verdaexports.com", 
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

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);

  // Initialize notification service with io
  const notificationService = require("./services/notificationService");
  notificationService.init(io);

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
  console.log(`Error: ${err ? err.message || err : "Unknown error"}`);

  // Don't crash for Redis max request limit errors if they bubble up here
  if (
    err &&
    err.message &&
    err.message.includes("max requests limit exceeded")
  ) {
    console.log("⚠️ Ignoring unhandled Redis limit error to keep server alive");
    return;
  }

  // Close server & exit process
  // server.close(() => process.exit(1));
});
