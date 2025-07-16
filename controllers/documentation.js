const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Helper function to draw a system component box
const drawComponentBox = (doc, x, y, width, height, title, description) => {
  doc.rect(x, y, width, height).stroke();
  doc.fontSize(8).font('Helvetica-Bold').text(title, x + 5, y + 5);
  doc.fontSize(7).font('Helvetica').text(description, x + 5, y + 20, {
    width: width - 10,
    align: 'left'
  });
};

// Helper function to draw a connection arrow
const drawArrow = (doc, startX, startY, endX, endY, label) => {
  doc.moveTo(startX, startY)
     .lineTo(endX, endY)
     .stroke();
  
  // Arrow head
  const angle = Math.atan2(endY - startY, endX - startX);
  const arrowLength = 10;
  doc.moveTo(endX, endY)
     .lineTo(
       endX - arrowLength * Math.cos(angle - Math.PI / 6),
       endY - arrowLength * Math.sin(angle - Math.PI / 6)
     )
     .moveTo(endX, endY)
     .lineTo(
       endX - arrowLength * Math.cos(angle + Math.PI / 6),
       endY - arrowLength * Math.sin(angle + Math.PI / 6)
     )
     .stroke();
  
  // Label
  if (label) {
    doc.fontSize(6).text(label, 
      (startX + endX) / 2 - 20, 
      (startY + endY) / 2 - 10,
      { width: 40, align: 'center' }
    );
  }
};

exports.generateProjectDocumentation = async (req, res) => {
  try {
    const chunks = [];
    const doc = new PDFDocument();
    
    // Track PDF size
    let totalSize = 0;
    doc.on('data', chunk => {
      totalSize += chunk.length;
      chunks.push(chunk);
      
      if (totalSize > 20480) {
        doc.end();
        return res.status(400).json({
          success: false,
          message: 'PDF size would exceed 20KB limit.'
        });
      }
    });

    const filename = `CRM_Project_Documentation.pdf`;
    const filepath = path.join(__dirname, '../documentation/', filename);
    
    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Collect PDF data in memory
    const pdfChunks = [];
    doc.on('data', chunk => pdfChunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(pdfChunks);
      const fileSize = pdfBuffer.length;
      
      if (fileSize < 10240 || fileSize > 20480) {
        return res.status(400).json({
          success: false,
          message: `PDF size (${Math.round(fileSize/1024)}KB) must be between 10KB and 20KB`
        });
      }
      
      fs.writeFileSync(filepath, pdfBuffer);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    });

    // Title Page
    doc.font('Helvetica-Bold')
       .fontSize(20)
       .text('CRM SYSTEM', { align: 'center' })
       .fontSize(16)
       .moveDown(0.5)
       .text('Technical Documentation', { align: 'center' })
       .moveDown(2)
       .fontSize(10)
       .text('Traincape Technology', { align: 'center' })
       .moveDown(0.5)
       .text(new Date().toLocaleDateString(), { align: 'center' });

    doc.addPage();

    // Table of Contents
    doc.fontSize(14)
       .text('Table of Contents', { align: 'left', underline: true })
       .moveDown(1);
    
    const sections = [
      '1. System Architecture',
      '2. Authentication Flow',
      '3. Employee Management',
      '4. Payroll System',
      '5. Chat System',
      '6. Code Examples',
      '7. API Reference',
      '8. Future Enhancements'
    ];

    sections.forEach((section, i) => {
      doc.fontSize(10)
         .text(section, { link: i + 1 })
         .moveDown(0.5);
    });

    doc.addPage();

    // 1. System Architecture Diagram
    doc.fontSize(14)
       .text('1. System Architecture', { align: 'left', underline: true })
       .moveDown(1);

    // Draw system architecture diagram
    const startY = doc.y;
    
    // Frontend Box
    drawComponentBox(doc, 50, startY, 150, 60, 'Frontend (React)', 
      'Components, Context API, Socket.IO Client, Web Audio');
    
    // Backend Box
    drawComponentBox(doc, 300, startY, 150, 60, 'Backend (Node.js)', 
      'Express, Socket.IO Server, JWT Auth');
    
    // Database Box
    drawComponentBox(doc, 300, startY + 100, 150, 60, 'MongoDB', 
      'Free Tier, Collections: Users, Payroll, Chat');
      
    // Database Schema
    doc.moveDown(10)
       .fontSize(10)
       .text('Database Schema:', { underline: true })
       .moveDown(1);
       
    // Users Collection
    drawComponentBox(doc, 50, doc.y, 120, 70, 'Users Collection', 
      'email: String\npassword: String (hashed)\nrole: String\nstatus: String\nprofile: Object\ncreatedAt: Date');
      
    // Payroll Collection  
    drawComponentBox(doc, 200, doc.y, 120, 70, 'Payroll Collection',
      'employeeId: ObjectId\nmonth: Date\nbaseSalary: Number\ndeductions: Object\nstatus: String\napprovedBy: ObjectId');
      
    // Chat Collection
    drawComponentBox(doc, 350, doc.y, 120, 70, 'Chat Collection',
      'sender: ObjectId\nrecipient: ObjectId\nmessage: String\nreadAt: Date\nattachments: Array\ncreatedAt: Date');

    // Draw connections
    drawArrow(doc, 200, startY + 30, 300, startY + 30, 'API Calls');
    drawArrow(doc, 300, startY + 90, 200, startY + 30, 'Responses');
    drawArrow(doc, 375, startY + 60, 375, startY + 100, 'Queries');

    doc.moveDown(7)
       .fontSize(8)
       .text('System Architecture Diagram showing main components and their interactions', 
         { align: 'center' });

    doc.addPage();

    // 2. Authentication Flow
    doc.fontSize(14)
       .text('2. Authentication Flow', { align: 'left', underline: true })
       .moveDown(1);

    // Draw authentication flow diagram
    const authStartY = doc.y;
    
    // Login Box
    drawComponentBox(doc, 50, authStartY, 100, 40, 'Login', 
      'Email + Password');
    
    // JWT Generation
    drawComponentBox(doc, 200, authStartY, 100, 40, 'JWT Token', 
      'Generation + Validation');
    
    // Protected Routes
    drawComponentBox(doc, 350, authStartY, 100, 40, 'Protected Routes', 
      'Role-based Access');

    // Draw flow arrows
    drawArrow(doc, 150, authStartY + 20, 200, authStartY + 20, 'Verify');
    drawArrow(doc, 300, authStartY + 20, 350, authStartY + 20, 'Allow');

    doc.moveDown(5)
       .fontSize(8)
       .text('Authentication Flow Diagram', { align: 'center' })
       .moveDown(1);

    // Code example for authentication
    doc.fontSize(10)
       .text('Authentication Code Example:', { underline: true })
       .moveDown(0.5)
       .fontSize(7)
       .font('Courier')
       .text(`
// Frontend Authentication with Error Handling
const login = async (email, password) => {
  try {
    const response = await api.post('/auth/login', {
      email,
      password
    });
    
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      return { success: true };
    }
    return { 
      success: false, 
      error: 'Invalid credentials'
    };
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Network error'
    };
  }
};

// Backend JWT Verification
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};`, { lineGap: 1 });

    doc.addPage();

    // 3. Employee Management
    doc.fontSize(14)
       .text('3. Employee Management', { align: 'left', underline: true })
       .moveDown(1);

    // Draw employee management diagram
    const empStartY = doc.y;
    
    // Employee Profile Box
    drawComponentBox(doc, 50, empStartY, 120, 50, 'Employee Profile', 
      'Personal Details\nDepartment\nRole');
    
    // Document Management
    drawComponentBox(doc, 200, empStartY, 120, 50, 'Documents', 
      'Upload\nVerification\nStorage');
    
    // Attendance System
    drawComponentBox(doc, 350, empStartY, 120, 50, 'Attendance', 
      'Daily Status\nReports\nAnalytics');

    // Draw connections
    drawArrow(doc, 170, empStartY + 25, 200, empStartY + 25, 'Upload');
    drawArrow(doc, 320, empStartY + 25, 350, empStartY + 25, 'Track');

    doc.moveDown(5)
       .fontSize(8)
       .text('Employee Management System Components', { align: 'center' });

    doc.addPage();

    // 4. Payroll System
    doc.fontSize(14)
       .text('4. Payroll System', { align: 'left', underline: true })
       .moveDown(1);

    // Draw payroll system diagram
    const payStartY = doc.y;
    
    // Salary Calculation Box
    drawComponentBox(doc, 50, payStartY, 120, 50, 'Salary Calculation', 
      '30 Days Base\nProration\nDeductions');
    
    // Approval Workflow
    drawComponentBox(doc, 200, payStartY, 120, 50, 'Approval Workflow', 
      'Draft → Review\n→ Approved → Paid');
    
    // PDF Generation
    drawComponentBox(doc, 350, payStartY, 120, 50, 'Salary Slip', 
      'PDF Generation\n10KB-20KB Size');

    // Draw workflow
    drawArrow(doc, 170, payStartY + 25, 200, payStartY + 25, 'Submit');
    drawArrow(doc, 320, payStartY + 25, 350, payStartY + 25, 'Generate');

    doc.moveDown(5)
       .fontSize(8)
       .text('Payroll System Workflow', { align: 'center' })
       .moveDown(1);

    // Payroll calculation code example
    doc.fontSize(10)
       .text('Salary Calculation Example:', { underline: true })
       .moveDown(0.5)
       .fontSize(7)
       .font('Courier')
       .text(`
const calculateSalary = (baseSalary, daysWorked) => {
  const dailyRate = baseSalary / 30; // 30 days base
  const workedAmount = dailyRate * daysWorked;
  
  // Apply prorations
  const finalAmount = Math.round(workedAmount * 100) / 100;
  return finalAmount;
};`, { lineGap: 1 });

    doc.addPage();

    // 5. Chat System
    doc.fontSize(14)
       .text('5. Chat System', { align: 'left', underline: true })
       .moveDown(1);

    // Draw chat system diagram
    const chatStartY = doc.y;
    
    // Client Socket Box
    drawComponentBox(doc, 50, chatStartY, 120, 50, 'Socket.IO Client', 
      'Real-time Events\nNotifications\nSound Effects');
    
    // Server Socket
    drawComponentBox(doc, 200, chatStartY, 120, 50, 'Socket.IO Server', 
      'Event Handling\nMessage Routing\nStatus Updates');
    
    // Message Storage
    drawComponentBox(doc, 350, chatStartY, 120, 50, 'MongoDB Storage', 
      'Chat History\nUser Status\nPreferences');

    // Draw real-time flow
    drawArrow(doc, 170, chatStartY + 25, 200, chatStartY + 25, 'Send');
    drawArrow(doc, 320, chatStartY + 25, 350, chatStartY + 25, 'Store');

    doc.moveDown(5)
       .fontSize(8)
       .text('Real-time Chat System Architecture', { align: 'center' })
       .moveDown(1);

    // Chat system code example
    doc.fontSize(10)
       .text('Chat Implementation Example:', { underline: true })
       .moveDown(0.5)
       .fontSize(7)
       .font('Courier')
       .text(`
// Frontend Socket Setup
const socket = io(SOCKET_URL);

socket.on('connect', () => {
  console.log('Connected to chat server');
});

socket.on('new_message', (message) => {
  if (soundEnabled) {
    playNotificationSound();
  }
  addMessageToChat(message);
});

// Backend Socket Handler
io.on('connection', (socket) => {
  socket.on('send_message', async (data) => {
    const message = await saveMessage(data);
    io.to(data.roomId).emit('new_message', message);
  });
});`, { lineGap: 1 });

    doc.addPage();

    // 6. API Reference
    doc.fontSize(14)
       .text('6. API Reference', { align: 'left', underline: true })
       .moveDown(1);

    // API documentation with examples
    const apis = [
      {
        endpoint: '/api/auth/login',
        method: 'POST',
        description: 'User authentication with email/password',
        request: `{
  "email": "user@example.com",
  "password": "securepass123"
}`,
        response: `{
  "success": true,
  "token": "eyJhbGciOiJ...",
  "user": {
    "id": "123",
    "email": "user@example.com",
    "role": "Employee"
  }
}`,
        returns: 'JWT token with user details'
      },
      {
        endpoint: '/api/employees',
        method: 'GET',
        description: 'List all employees with pagination',
        request: `?page=1&limit=10&department=IT`,
        response: `{
  "success": true,
  "data": [{
    "id": "123",
    "name": "John Doe",
    "department": "IT",
    "role": "Developer"
  }],
  "pagination": {
    "total": 50,
    "pages": 5,
    "current": 1
  }
}`,
        returns: 'Employee[] with pagination metadata'
      },
      {
        endpoint: '/api/payroll/generate',
        method: 'POST',
        description: 'Generate monthly payroll',
        request: `{
  "employeeId": "123",
  "month": "2024-03",
  "baseSalary": 5000,
  "deductions": {
    "tax": 500,
    "insurance": 200
  }
}`,
        response: `{
  "success": true,
  "payroll": {
    "id": "456",
    "netSalary": 4300,
    "status": "Draft"
  }
}`,
        returns: 'Payroll details with calculation'
      },
      {
        endpoint: '/api/chat/history',
        method: 'GET',
        description: 'Fetch chat history with pagination',
        request: `?userId=123&page=1&limit=20`,
        response: `{
  "success": true,
  "messages": [{
    "id": "789",
    "sender": "123",
    "message": "Hello!",
    "createdAt": "2024-03-20T10:30:00Z"
  }],
  "pagination": {
    "total": 100,
    "pages": 5
  }
}`,
        returns: 'Message[] with metadata'
      }
    ];

    apis.forEach(api => {
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .text(`${api.method} ${api.endpoint}`)
         .moveDown(0.2)
         .fontSize(8)
         .font('Helvetica')
         .text(`Description: ${api.description}`)
         .text(`Returns: ${api.returns}`)
         .moveDown(0.5);
    });

    // 7. Future Enhancements
    doc.addPage()
       .fontSize(14)
       .text('7. Future Enhancements', { align: 'left', underline: true })
       .moveDown(1)
       .fontSize(10);

    const enhancements = [
      {
        feature: 'Advanced Reporting',
        description: 'Interactive dashboards with data visualization'
      },
      {
        feature: 'Leave Management',
        description: 'Automated leave request and approval system'
      },
      {
        feature: 'Performance Reviews',
        description: 'KPI tracking and evaluation system'
      },
      {
        feature: 'Mobile Application',
        description: 'Native mobile apps for iOS and Android'
      }
    ];

    enhancements.forEach(item => {
      doc.font('Helvetica-Bold')
         .text(item.feature)
         .font('Helvetica')
         .fontSize(8)
         .text(item.description)
         .moveDown(0.5);
    });

    // Footer
    doc.fontSize(7)
       .text('Generated: ' + new Date().toLocaleString(), { align: 'center' })
       .text('Traincape Technology CRM System', { align: 'center' });

    // Finish PDF
    doc.end();

  } catch (error) {
    console.error('Documentation generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating documentation'
    });
  }
};