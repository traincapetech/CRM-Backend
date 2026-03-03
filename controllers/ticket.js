const Ticket = require("../models/Ticket");
const User = require("../models/User");
const Department = require("../models/Department");

// 1. Create Ticket (Any user)
const {
  sendTicketCreatedEmail,
  sendTicketAssignedEmail,
  sendTicketStatusUpdateEmail,
} = require("../services/emailService");
const { createNotification } = require("../services/notificationService");
const TicketChat = require("../models/TicketChat");

const fileStorage = require("../services/fileStorageService");

// 1. Create Ticket (Any user)
exports.createTicket = async (req, res) => {
  try {
    const { title, description, priority, assignedDept, category } = req.body;

    // Handle file uploads if any
    const processedAttachments = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const uploaded = await fileStorage.uploadFile(file, "tickets");
          processedAttachments.push({
            url: uploaded.url,
            fileName: file.originalname,
            fileType: file.mimetype,
          });
        } catch (uploadError) {
          console.error("Error uploading ticket attachment:", uploadError);
          // Continue with other files if one fails
        }
      }
    }

    // Calculate Due Date based on Priority
    let hoursToAdd = 168; // Default LOW: 7 days (168 hours)
    if (priority === "URGENT") hoursToAdd = 4;
    else if (priority === "HIGH") hoursToAdd = 24;
    else if (priority === "MEDIUM") hoursToAdd = 72; // 3 days

    const dueDate = new Date();
    dueDate.setHours(dueDate.getHours() + hoursToAdd);

    const ticketData = {
      title,
      description,
      priority: priority || "MEDIUM",
      category: category || "General",
      raisedBy: req.user._id,
      assignedDept: assignedDept || "IT", // Default to IT if not specified
      dueDate,
      slaStatus: "ON_TIME",
      attachments: processedAttachments,
      activityLog: [
        {
          action: "CREATED",
          performedBy: req.user._id,
          details: "Ticket created",
          timestamp: new Date(),
        },
      ],
    };

    const ticket = await Ticket.create(ticketData);

    // Populate the ticket with user details
    const populatedTicket = await Ticket.findById(ticket._id).populate(
      "raisedBy",
      "fullName name email role",
    );

    const deptId = populatedTicket.preferredDept || populatedTicket.assignedDept;
    if (deptId) {
      const Department = require("../models/Department");
      const dept = await Department.findById(deptId);
      if (dept) {
        populatedTicket._doc.assignedDept = dept;
      }
    }

    // Send confirmation email
    if (populatedTicket.raisedBy && populatedTicket.raisedBy.email) {
      sendTicketCreatedEmail(populatedTicket, populatedTicket.raisedBy);
    }

    // REAL-TIME BROADCAST: Notify all Admins and Managers that a new ticket exists
    const { broadcastToRole } = require("../services/notificationService");
    
    // Dynamically find all relevant roles that should receive "new ticket" alerts
    // For now, we'll look for strings containing "Admin" or "Manager" to keep it flexible but data-driven
    const User = require("../models/User");
    const adminUsers = await User.find({
      $or: [
        { role: /Admin/i },
        { role: /Manager/i },
        { role: "HR" }
      ]
    }).distinct("role");

    adminUsers.forEach(role => {
      broadcastToRole(role, "new_ticket_created", { 
        ticketId: populatedTicket._id,
        raisedBy: populatedTicket.raisedBy?.fullName || "A user",
        title: populatedTicket.title 
      });
    });

    return res.status(201).json({
      success: true,
      data: populatedTicket,
    });
  } catch (error) {
    console.error("Error creating ticket:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 2. Get All Tickets (Role-Based)
// 2. Get All Tickets (Role-Based)
exports.getAllTickets = async (req, res) => {
  try {
    let filter = {};
    const userRole = req.user.role;

    // Admin sees all tickets
    if (userRole === "Admin") {
      // No filter - admin sees everything
      filter = {};
    }
    // Managers (Manager, IT Manager, HR) see their department's tickets
    else if (["Manager", "IT Manager", "HR"].includes(userRole)) {
      // Get user's department ID from role
      const deptController = require("./department");
      const userDeptId = deptController.getDepartmentFromRole(userRole);

      if (userDeptId) {
        // Fix: Manager sees tickets assigned to their dept OR (unassigned AND preferred for their dept)
        filter = {
          $or: [
            { assignedDept: userDeptId },
            { assignedDept: null, preferredDept: userDeptId },
            // Also keep tickets they raised or are assigned to personally (just in case)
            { assignedTo: req.user._id },
            { raisedBy: req.user._id },
          ],
        };
      } else {
        // If no department match, show tickets assigned to or raised by them
        filter = {
          $or: [{ assignedTo: req.user._id }, { raisedBy: req.user._id }],
        };
      }
    }
    // Regular users see tickets assigned to them OR raised by them
    else {
      filter = {
        $or: [{ assignedTo: req.user._id }, { raisedBy: req.user._id }],
      };
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Additional filters from query
    if (req.query.status && req.query.status !== "ALL") {
      filter.status = req.query.status;
    }
    if (req.query.priority && req.query.priority !== "ALL") {
      filter.priority = req.query.priority;
    }
    if (req.query.search) {
      filter.$or = filter.$or || [];
      filter.$or.push(
        { title: { $regex: req.query.search, $options: "i" } },
        { description: { $regex: req.query.search, $options: "i" } }
      );
    }

    const total = await Ticket.countDocuments(filter);
    const tickets = await Ticket.find(filter)
      .populate("raisedBy", "fullName name email role")
      .populate("assignedTo", "fullName name email role")
      .populate("activityLog.performedBy", "fullName name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Manually attach department data
    const enrichedTickets = enrichTicketsWithDepartments(tickets);

    return res.status(200).json({
      success: true,
      count: enrichedTickets.length,
      data: enrichedTickets,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error in getAllTickets:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Helper function to attach department data to tickets
function enrichTicketsWithDepartments(tickets) {
  const DEPARTMENTS = [
    { id: "IT", name: "IT", description: "Information Technology Department" },
    { id: "SALES", name: "Sales", description: "Sales Department" },
    { id: "LEAD", name: "Lead", description: "Lead Generation Department" },
    { id: "HR", name: "HR", description: "Human Resources Department" },
  ];

  return tickets.map((ticket) => {
    const ticketObj = ticket.toObject ? ticket.toObject() : ticket;

    // Attach assignedDept data
    if (ticketObj.assignedDept) {
      const dept = DEPARTMENTS.find((d) => d.id === ticketObj.assignedDept);
      if (dept) {
        ticketObj.assignedDept = {
          _id: dept.id,
          name: dept.name,
          description: dept.description,
        };
      }
    }

    // Attach preferredDept data
    if (ticketObj.preferredDept) {
      const dept = DEPARTMENTS.find((d) => d.id === ticketObj.preferredDept);
      if (dept) {
        ticketObj.preferredDept = {
          _id: dept.id,
          name: dept.name,
          description: dept.description,
        };
      }
    }

    return ticketObj;
  });
}

// 3. Get Single Ticket
exports.getTicketById = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate("raisedBy", "fullName name email role")
      .populate("assignedTo", "fullName name email role")
      // Remove populate("assignedDept") since it's a string, not ObjectId
      .populate("activityLog.performedBy", "fullName name email role");

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

//4. Assign Ticket (Admin / Managers)
exports.assignTicket = async (req, res) => {
  try {
    const { departmentId, memberId } = req.body;
    const userRole = req.user.role;

    // Only Admin and Managers (Manager, IT Manager, HR) can assign tickets
    if (!["Admin", "Manager", "IT Manager", "HR"].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized - Only Admin and Managers can assign tickets",
      });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    ticket.assignTicket(departmentId, memberId);

    // Add activity log
    ticket.activityLog.push({
      action: "ASSIGNED",
      performedBy: req.user._id,
      details:
        `Assigned to ${departmentId} department` +
        (memberId ? ` (Member: ${memberId})` : ""),
      timestamp: new Date(),
    });
    ticket.lastActivityAt = new Date();

    await ticket.save();

    // Populate for email
    const fullTicket = await Ticket.findById(ticket._id)
      .populate("assignedTo", "fullName email")
      .populate("raisedBy", "fullName email");

    // Send email to assignee
    if (fullTicket.assignedTo) {
      sendTicketAssignedEmail(fullTicket, fullTicket.assignedTo, req.user);
    }

    // Send email to raiser about status update (Assigned)
    if (fullTicket.raisedBy) {
      sendTicketStatusUpdateEmail(fullTicket, fullTicket.raisedBy);
      
      // CREATE NOTIFICATION
      await createNotification({
        recipient: fullTicket.raisedBy._id,
        type: "TICKET_ASSIGNED",
        ticketId: fullTicket._id,
        message: `Your ticket "${fullTicket.title}" has been assigned to ${fullTicket.assignedTo?.fullName || departmentId}`,
      });

      // BROADCAST UPDATE to ticket room (for real-time update if user has ticket open)
      const { broadcastTicketUpdate } = require("../services/notificationService");
      broadcastTicketUpdate(fullTicket._id, { status: fullTicket.status, assignee: fullTicket.assignedTo });
      
      // BROADCAST to the ASSIGNEE'S personal room (to refresh their dashboard if they were not in the ticket room)
      if (fullTicket.assignedTo?._id) {
         const { broadcastToUser } = require("../services/notificationService");
         broadcastToUser(fullTicket.assignedTo._id.toString(), "ticket_assigned", { 
           ticketId: fullTicket._id,
           title: fullTicket.title 
         });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Ticket assigned successfully",
      data: fullTicket,
    });
  } catch (error) {
    console.error("Error in assignTicket:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 5. Start Progress (Assigned users)
exports.startProgress = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Check if user is assigned to this ticket or is Admin
    if (
      ticket.assignedTo &&
      ticket.assignedTo.toString() !== req.user._id.toString() &&
      req.user.role !== "Admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized - Ticket is not assigned to you",
      });
    }

    ticket.startProgress();

    ticket.activityLog.push({
      action: "STATUS_CHANGE",
      performedBy: req.user._id,
      details: "Status changed to IN_PROGRESS",
      timestamp: new Date(),
    });
    ticket.lastActivityAt = new Date();

    await ticket.save();

    // Populate for email
    const fullTicket = await Ticket.findById(ticket._id).populate(
      "raisedBy",
      "fullName email",
    );
    if (fullTicket.raisedBy) {
      sendTicketStatusUpdateEmail(fullTicket, fullTicket.raisedBy);
      
      // CREATE NOTIFICATION
      await createNotification({
        recipient: fullTicket.raisedBy._id,
        type: "STATUS_UPDATE",
        ticketId: fullTicket._id,
        message: `Progress has started on your ticket: "${fullTicket.title}"`,
      });

      // BROADCAST UPDATE
      const { broadcastTicketUpdate } = require("../services/notificationService");
      broadcastTicketUpdate(fullTicket._id, { status: fullTicket.status });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket moved to IN_PROGRESS",
      data: fullTicket,
    });
  } catch (error) {
    console.error("Error in startProgress:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 6. Resolve Ticket (Assigned users)
exports.resolveTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Check if user is assigned to this ticket or is Admin
    if (
      ticket.assignedTo &&
      ticket.assignedTo.toString() !== req.user._id.toString() &&
      req.user.role !== "Admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized - Ticket is not assigned to you",
      });
    }

    ticket.resolveTicket();

    ticket.activityLog.push({
      action: "STATUS_CHANGE",
      performedBy: req.user._id,
      details: "Status changed to RESOLVED",
      timestamp: new Date(),
    });
    ticket.lastActivityAt = new Date();

    await ticket.save();

    const fullTicket = await Ticket.findById(ticket._id).populate(
      "raisedBy",
      "fullName email",
    );
    if (fullTicket.raisedBy) {
      sendTicketStatusUpdateEmail(fullTicket, fullTicket.raisedBy);

      // CREATE NOTIFICATION
      await createNotification({
        recipient: fullTicket.raisedBy._id,
        type: "STATUS_UPDATE",
        ticketId: fullTicket._id,
        message: `Your ticket "${fullTicket.title}" has been marked as RESOLVED`,
      });

      // BROADCAST UPDATE
      const { broadcastTicketUpdate } = require("../services/notificationService");
      broadcastTicketUpdate(fullTicket._id, { status: fullTicket.status });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket resolved",
      data: fullTicket,
    });
  } catch (error) {
    console.error("Error in resolveTicket:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 7. Close Ticket (Assigned users)
exports.closeTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Check if user is assigned to this ticket or is Admin
    if (
      ticket.assignedTo &&
      ticket.assignedTo.toString() !== req.user._id.toString() &&
      req.user.role !== "Admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized - Ticket is not assigned to you",
      });
    }

    ticket.closeTicket();

    ticket.activityLog.push({
      action: "STATUS_CHANGE",
      performedBy: req.user._id,
      details: "Ticket CLOSED",
      timestamp: new Date(),
    });
    ticket.lastActivityAt = new Date();

    await ticket.save();

    const fullTicket = await Ticket.findById(ticket._id).populate(
      "raisedBy",
      "fullName email",
    );
    if (fullTicket.raisedBy) {
      sendTicketStatusUpdateEmail(fullTicket, fullTicket.raisedBy);

      // CREATE NOTIFICATION
      await createNotification({
        recipient: fullTicket.raisedBy._id,
        type: "STATUS_UPDATE",
        ticketId: fullTicket._id,
        message: `Your ticket "${fullTicket.title}" has been CLOSED`,
      });

      // BROADCAST UPDATE
      const { broadcastTicketUpdate } = require("../services/notificationService");
      broadcastTicketUpdate(fullTicket._id, { status: fullTicket.status });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket closed (3-day reopen window started)",
      data: fullTicket,
    });
  } catch (error) {
    console.error("Error in closeTicket:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 8. Reopen Ticket (Ticket creator - within 3 days)
exports.reopenTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Only the person who raised the ticket can reopen it (or Admin)
    if (
      ticket.raisedBy &&
      ticket.raisedBy.toString() !== req.user._id.toString() &&
      req.user.role !== "Admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized - You did not raise this ticket",
      });
    }

    ticket.reopenTicket();

    ticket.activityLog.push({
      action: "STATUS_CHANGE",
      performedBy: req.user._id,
      details: "Ticket REOPENED",
      timestamp: new Date(),
    });
    ticket.lastActivityAt = new Date();

    await ticket.save();

    const fullTicket = await Ticket.findById(ticket._id).populate(
      "raisedBy",
      "fullName email",
    );
    // Notify admin or assignments if needed, but for now just confirmation to user
    if (fullTicket.raisedBy) {
      sendTicketStatusUpdateEmail(fullTicket, fullTicket.raisedBy);

      // BROADCAST UPDATE
      const { broadcastTicketUpdate } = require("../services/notificationService");
      broadcastTicketUpdate(fullTicket._id, { status: fullTicket.status });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket reopened",
      data: fullTicket,
    });
  } catch (error) {
    console.error("Error in reopenTicket:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// 9. Delete Ticket (Admin only)
exports.deleteTicket = async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized - Only Admin can delete tickets",
      });
    }

    const ticket = await Ticket.findByIdAndDelete(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket deleted",
    });
  } catch (error) {
    console.error("Error in deleteTicket:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 10. Get Ticket Chat History (Paginated)
exports.getTicketChat = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    const chat = await TicketChat.getTicketChat(req.params.id, page, limit);
    const total = await TicketChat.countDocuments({ ticketId: req.params.id });

    return res.status(200).json({
      success: true,
      data: chat.reverse(), // Return in chronological order for UI
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 11. Get Ticket Stats (Admin Only)
exports.getTicketStats = async (req, res) => {
  try {
    if (req.user.role !== "Admin" && !["Manager", "IT Manager", "HR"].includes(req.user.role)) {
       return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    let filter = {};
    const userRole = req.user.role;
    if (userRole !== "Admin") {
       const deptController = require("./department");
       const userDeptId = deptController.getDepartmentFromRole(userRole);
       if (userDeptId) filter.assignedDept = userDeptId;
    }

    const stats = await Ticket.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const priorityStats = await Ticket.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]);

    const slaStats = await Ticket.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$slaStatus",
          count: { $sum: 1 },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        status: stats.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
        priority: priorityStats.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
        sla: slaStats.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 12. Upload Chat Attachments
exports.uploadChatAttachments = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files uploaded",
      });
    }

    const processedAttachments = [];
    for (const file of req.files) {
      try {
        const uploaded = await fileStorage.uploadFile(file, "chat");
        processedAttachments.push({
          url: uploaded.url,
          fileName: file.originalname,
          fileType: file.mimetype,
        });
      } catch (uploadError) {
        console.error("Error uploading chat attachment:", uploadError);
        // Continue with other files if one fails
      }
    }

    return res.status(200).json({
      success: true,
      data: processedAttachments,
    });
  } catch (error) {
    console.error("Error in uploadChatAttachments:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

