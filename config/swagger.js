/**
 * Swagger/OpenAPI Configuration
 *
 * API documentation setup using Swagger
 */

const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const path = require("path");
const fs = require("fs");

// Resolve glob patterns manually since swagger-jsdoc v1.x doesn't support them
function resolveGlobs(patterns) {
  const files = [];
  // Assuming this file is in a 'config' directory, and the server root is one level up
  const serverDir = path.resolve(__dirname, "..");
  for (const pattern of patterns) {
    if (pattern.includes("*")) {
      // Handle glob patterns like './routes/*.js'
      const patternDir = path.dirname(pattern);
      const patternExt = path.extname(pattern);
      const absoluteDir = path.resolve(serverDir, patternDir);

      try {
        if (
          fs.existsSync(absoluteDir) &&
          fs.statSync(absoluteDir).isDirectory()
        ) {
          fs.readdirSync(absoluteDir).forEach((file) => {
            if (file.endsWith(patternExt)) {
              files.push(path.join(absoluteDir, file));
            }
          });
        }
      } catch (e) {
        console.warn(
          `⚠️  Could not read directory for swagger: ${absoluteDir} - ${e.message}`,
        );
      }
    } else {
      // Handle direct file paths like './server.js'
      const resolved = path.resolve(serverDir, pattern);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        files.push(resolved);
      }
    }
  }
  return files;
}

const options = {
  swaggerDefinition: {
    openapi: "3.0.0",
    info: {
      title: "Traincape CRM API",
      version: "1.0.0",
      description:
        "Comprehensive CRM API for lead management, sales tracking, employee management, and more.",
      contact: {
        name: "Traincape Technology",
        email: "crm@traincapetech.in",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: process.env.API_URL || "http://localhost:8080",
        description: "Development server",
      },
      {
        url: "https://crm-backend-o36v.onrender.com",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token obtained from /api/auth/login",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              example: "Error message here",
            },
          },
        },
        Success: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            data: {
              type: "object",
            },
            message: {
              type: "string",
              example: "Operation successful",
            },
          },
        },
        Lead: {
          type: "object",
          properties: {
            _id: { type: "string" },
            name: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            country: { type: "string" },
            course: { type: "string" },
            status: {
              type: "string",
              enum: [
                "Introduction",
                "Acknowledgement",
                "Question",
                "Future Promise",
                "Payment",
                "Analysis",
              ],
            },
            assignedTo: { type: "string" },
            leadPerson: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Sale: {
          type: "object",
          properties: {
            _id: { type: "string" },
            customerName: { type: "string" },
            email: { type: "string" },
            contactNumber: { type: "string" },
            country: { type: "string" },
            course: { type: "string" },
            totalCost: { type: "number" },
            currency: {
              type: "string",
              enum: ["USD", "EUR", "GBP", "INR", "CAD", "AUD"],
            },
            status: {
              type: "string",
              enum: ["Completed", "Pending", "Cancelled"],
            },
            salesPerson: { type: "string" },
            leadPerson: { type: "string" },
            date: { type: "string", format: "date-time" },
          },
        },
        User: {
          type: "object",
          properties: {
            _id: { type: "string" },
            fullName: { type: "string" },
            email: { type: "string" },
            role: {
              type: "string",
              enum: [
                "Admin",
                "Manager",
                "Sales Person",
                "Lead Person",
                "Customer",
                "HR",
                "Employee",
                "IT Staff",
              ],
            },
            active: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: resolveGlobs(["./routes/*.js", "./controllers/*.js", "./server.js"]),
};

let swaggerSpec;
try {
  swaggerSpec = swaggerJsdoc(options);
} catch (err) {
  console.warn("⚠️  Swagger initialization failed:", err.message);
  swaggerSpec = {
    openapi: "3.0.0",
    info: { title: "Traincape CRM API", version: "1.0.0" },
    paths: {},
  };
}

const swaggerSetup = (app) => {
  // Swagger UI endpoint
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "Traincape CRM API Documentation",
    }),
  );

  // JSON endpoint
  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  console.log("📚 API Documentation available at: /api-docs");
};

module.exports = swaggerSetup;
