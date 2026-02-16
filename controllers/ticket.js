const Ticket = require("../models/Ticket");
const User = require("../models/User");
const Department = require("../models/Department");

// 1. Create Ticket (Any user)
const {
  sendTicketCreatedEmail,
  sendTicketAssignedEmail,
  sendTicketStatusUpdateEmail,
} = require("../services/emailService");

// 1. Create Ticket (Any user)
exports.createTicket = async (req, res) => {
  try {
    const { title, description, priority, preferredDept, attachments } =
      req.body;

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
      priority,
      raisedBy: req.user._id,
      dueDate,
      slaStatus: "ON_TIME",
      attachments: attachments || [],
      activityLog: [
        {
          action: "CREATED",
          performedBy: req.user._id,
          details: "Ticket created",
          timestamp: new Date(),
        },
      ],
    };

    // Add preferredDept if provided
    if (preferredDept) {
      ticketData.preferredDept = preferredDept;
    }

    const ticket = await Ticket.create(ticketData);

    // Populate the ticket with user details
    const populatedTicket = await Ticket.findById(ticket._id).populate(
      "raisedBy",
      "fullName name email role",
    );

    // Manually attach department data (since it's virtual)
    const DEPARTMENTS = require("./department").DEPARTMENTS || [
      {
        id: "IT",
        name: "IT",
        description: "Information Technology Department",
      },
      { id: "SALES", name: "Sales", description: "Sales Department" },
      { id: "LEAD", name: "Lead", description: "Lead Generation Department" },
      { id: "HR", name: "HR", description: "Human Resources Department" },
    ];

    if (populatedTicket.preferredDept) {
      const dept = DEPARTMENTS.find(
        (d) => d.id === populatedTicket.preferredDept,
      );
      if (dept) {
        populatedTicket._doc.preferredDept = {
          _id: dept.id,
          name: dept.name,
          description: dept.description,
        };
      }
    }

    // Send confirmation email
    if (populatedTicket.raisedBy && populatedTicket.raisedBy.email) {
      sendTicketCreatedEmail(populatedTicket, populatedTicket.raisedBy);
    }

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
        filter.assignedDept = userDeptId;
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

    const tickets = await Ticket.find(filter)
      .populate("raisedBy", "fullName name email role")
      .populate("assignedTo", "fullName name email role")
      .populate("activityLog.performedBy", "fullName name email role")
      .sort({ createdAt: -1 });

    // Manually attach department data
    const enrichedTickets = enrichTicketsWithDepartments(tickets);

    return res.status(200).json({
      success: true,
      count: enrichedTickets.length,
      data: enrichedTickets,
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
      .populate("raisedBy", "name email")
      .populate("assignedTo", "name email")
      .populate("assignedDept", "name")
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
