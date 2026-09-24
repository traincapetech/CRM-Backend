# Traincape CRM Backend

Complete backend server for Traincape CRM system with Node.js, Express, and MongoDB.

## Features

- **Authentication & Authorization**: JWT-based auth with role-based access control
- **Lead Management**: Create, assign, track, and manage leads
- **Sales Tracking**: Complete sales pipeline with lead person sales
- **Task Management**: IT and Sales task assignment and tracking
- **Employee Management**: Employee records, attendance, payroll, leave management
- **Real-time Chat**: WebSocket-based messaging system
- **File Upload**: Local and Google Drive storage support
- **Email Notifications**: Automated email service for sales and updates
- **Currency Conversion**: Real-time exchange rates
- **Reports & Analytics**: Comprehensive dashboard data

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (jsonwebtoken)
- **File Upload**: Multer + Google Drive API
- **Email**: Nodemailer
- **Real-time**: Socket.io
- **Security**: bcryptjs, CORS, IP filtering

## Quick Start

### Prerequisites

- Node.js v14+
- MongoDB Atlas account
- Email SMTP credentials (optional)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server
NODE_ENV=production
PORT=8080

# Database
MONGO_URI=your_mongodb_atlas_connection_string

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRE=30d

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
FROM_EMAIL=your_email@gmail.com
FROM_NAME=Traincape CRM

# File Storage
USE_GOOGLE_DRIVE=false

# Frontend URL (for CORS)
CLIENT_URL=https://your-frontend-url.com
```

### Run Locally

```bash
node server.js
```

Server will start on `http://localhost:8080`

## Deployment to Render

### Option 1: Using Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository: `traincapetech/CRM-Backend`
4. Configure:
   - **Name**: `crm-backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Environment**: Node
5. Add environment variables (see above)
6. Click **"Create Web Service"**

### Option 2: Using render.yaml (in parent directory)

The project includes a `render.yaml` configuration file. Render will auto-detect and deploy.

## API Documentation

### Base URL
- Production: `https://your-backend.onrender.com/api`
- Local: `http://localhost:8080/api`

### Authentication Endpoints

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with OTP

### Lead Endpoints

- `GET /api/leads` - Get all leads
- `GET /api/leads/assigned` - Get assigned leads
- `POST /api/leads` - Create new lead
- `PUT /api/leads/:id` - Update lead
- `DELETE /api/leads/:id` - Delete lead

### Sales Endpoints

- `GET /api/sales` - Get all sales
- `GET /api/lead-sales` - Get lead person sales
- `POST /api/sales` - Create new sale
- `PUT /api/sales/:id` - Update sale
- `DELETE /api/sales/:id` - Delete sale

### Task Endpoints

- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Employee Endpoints

- `GET /api/employees` - Get all employees
- `GET /api/employees/:id` - Get employee by ID
- `POST /api/employees` - Create employee
- `PUT /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee

## Project Structure

```
server/
├── config/           # Configuration files
├── controllers/      # Request handlers
├── middleware/       # Custom middleware
├── models/          # Mongoose schemas
├── routes/          # API routes
├── services/        # Business logic
├── utils/           # Helper functions
├── server.js        # Entry point
└── package.json     # Dependencies
```

## Security Features

- JWT authentication
- Password hashing with bcrypt
- CORS configuration
- IP filtering middleware
- MongoDB injection protection
- Input validation

## Key Features Implemented

✅ Complete authentication system
✅ Lead management with assignment
✅ Sales tracking with lead person attribution
✅ Task management for IT and Sales departments
✅ Employee management with documents
✅ Attendance tracking
✅ Payroll management
✅ Leave application system
✅ Real-time chat
✅ Email notifications
✅ File upload (local + Google Drive)
✅ Currency conversion
✅ Activity logging
✅ Dashboard analytics

## Production Checklist

- [ ] Set strong `JWT_SECRET`
- [ ] Configure production `MONGO_URI`
- [ ] Add `CLIENT_URL` for CORS
- [ ] Set `NODE_ENV=production`
- [ ] Configure email SMTP (optional)
- [ ] Enable MongoDB Atlas IP whitelist
- [ ] Review and update IP filter list
- [ ] Test all API endpoints
- [ ] Monitor error logs

## Support

For issues and questions, contact: support@traincapetech.com

## License

Proprietary - Traincape Technology Pvt Ltd

