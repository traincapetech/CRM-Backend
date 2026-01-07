/**
 * Swagger/OpenAPI Configuration
 * 
 * API documentation setup using Swagger
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Traincape CRM API',
      version: '1.0.0',
      description: 'Comprehensive CRM API for lead management, sales tracking, employee management, and more.',
      contact: {
        name: 'Traincape Technology',
        email: 'crm@traincapetech.in'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:8080',
        description: 'Development server'
      },
      {
        url: 'https://crm-backend-o36v.onrender.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/auth/login'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              example: 'Error message here'
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object'
            },
            message: {
              type: 'string',
              example: 'Operation successful'
            }
          }
        },
        Lead: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            country: { type: 'string' },
            course: { type: 'string' },
            status: { 
              type: 'string',
              enum: ['Introduction', 'Acknowledgement', 'Question', 'Future Promise', 'Payment', 'Analysis']
            },
            assignedTo: { type: 'string' },
            leadPerson: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Sale: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            customerName: { type: 'string' },
            email: { type: 'string' },
            contactNumber: { type: 'string' },
            country: { type: 'string' },
            course: { type: 'string' },
            totalCost: { type: 'number' },
            currency: { type: 'string', enum: ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'] },
            status: { 
              type: 'string',
              enum: ['Completed', 'Pending', 'Cancelled']
            },
            salesPerson: { type: 'string' },
            leadPerson: { type: 'string' },
            date: { type: 'string', format: 'date-time' }
          }
        },
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            fullName: { type: 'string' },
            email: { type: 'string' },
            role: { 
              type: 'string',
              enum: ['Admin', 'Manager', 'Sales Person', 'Lead Person', 'Customer', 'HR', 'Employee', 'IT Staff']
            },
            active: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './routes/*.js',
    './controllers/*.js',
    './server.js'
  ]
};

const swaggerSpec = swaggerJsdoc(options);

const swaggerSetup = (app) => {
  // Swagger UI endpoint
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Traincape CRM API Documentation'
  }));

  // JSON endpoint
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log('📚 API Documentation available at: /api-docs');
};

module.exports = swaggerSetup;

