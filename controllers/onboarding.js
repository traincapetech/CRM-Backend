const crypto = require("crypto");
const bcrypt = require("bcrypt");
const CandidateInvite = require("../models/CandidateInvite");
const Employee = require("../models/Employee");
const User = require("../models/User");
const Department = require("../models/Department");
const EmployeeRole = require("../models/EmployeeRole");
const fileStorage = require("../services/fileStorageService");
const { notifyAdmins } = require("../services/notificationService");
const JourneyService = require("../services/journeyService");
const {
  sendOnboardingInviteEmail,
  sendOnboardingApprovalEmail,
  sendJoiningDayWelcomeEmail,
} = require("../services/emailService");

// ── Multer fields for candidate document uploads ───────────────────────────
exports.uploadCandidateDocs = fileStorage.uploadMiddleware.fields([
  { name: "resume", maxCount: 1 },
  { name: "photograph", maxCount: 1 },
  { name: "panCard", maxCount: 1 },
  { name: "aadharCard", maxCount: 1 },
  { name: "educationalDocs", maxCount: 3 },
  { name: "experienceLetter", maxCount: 1 },
  { name: "signature", maxCount: 1 },
]);

// ── Helper: generate a secure token ───────────────────────────────────────
const generateToken = () => crypto.randomBytes(32).toString("hex");

// ── Helper: build portal URL ───────────────────────────────────────────────
const getPortalUrl = (token) => {
  const base =
    process.env.CLIENT_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:5173";
  return `${base}/onboarding/${token}`;
};

// ═══════════════════════════════════════════════════════════════════════════
// HR PROTECTED ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// @desc    HR sends invite to candidate
// @route   POST /api/onboarding/invite
// @access  Private (Admin, HR, Manager)
exports.createInvite = async (req, res) => {
  try {
    const {
      fullName,
      personalEmail,
      phoneNumber,
      department,
      role,
      employmentType,
      proposedSalary,
      joiningDate,
      joiningTime,
      branchLocation,
      notes,
    } = req.body;

    // Check if invite already exists for this email
    const existing = await CandidateInvite.findOne({ personalEmail: personalEmail.toLowerCase().trim() });
    if (existing && existing.onboardingStatus !== "REJECTED") {
      return res.status(400).json({
        success: false,
        message: `An onboarding invite already exists for ${personalEmail} (Status: ${existing.onboardingStatus})`,
      });
    }

    const token = generateToken();
    const expiryHours = parseInt(process.env.ONBOARDING_TOKEN_EXPIRY_HOURS) || 72;
    const tokenExpiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const invite = await CandidateInvite.create({
      fullName,
      personalEmail,
      phoneNumber,
      department,
      role,
      employmentType: employmentType || "PERMANENT",
      proposedSalary,
      joiningDate,
      joiningTime,
      branchLocation,
      notes,
      invitedBy: req.user.id,
      onboardingToken: token,
      tokenExpiry,
      onboardingStatus: "LINK_SENT",
      invitedAt: new Date(),
    });

    // Send invite email
    const portalUrl = getPortalUrl(token);
    try {
      await sendOnboardingInviteEmail({
        candidateName: fullName,
        candidateEmail: personalEmail,
        portalUrl,
        expiryHours,
        joiningDate,
        invitedByName: req.user.fullName,
      });
    } catch (emailErr) {
      console.error("Invite email failed:", emailErr.message);
    }

    // Notify admins
    await notifyAdmins({
      type: "CANDIDATE_INVITED",
      message: `New candidate invited: ${fullName} (${personalEmail}) by ${req.user.fullName}`,
    });

    res.status(201).json({
      success: true,
      data: invite,
      portalUrl,
      message: "Invite sent successfully",
    });
  } catch (error) {
    console.error("createInvite error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get onboarding queue (all invites)
// @route   GET /api/onboarding/queue
// @access  Private (Admin, HR, Manager)
exports.getQueue = async (req, res) => {
  try {
    const { status, department, search, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status && status !== "ALL") query.onboardingStatus = status;
    if (department) query.department = department;

    let invites = await CandidateInvite.find(query).sort({ createdAt: -1 });

    // Search filter
    if (search) {
      const s = search.toLowerCase();
      invites = invites.filter(
        (i) =>
          i.fullName?.toLowerCase().includes(s) ||
          i.personalEmail?.toLowerCase().includes(s)
      );
    }

    const total = invites.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginated = invites.slice(startIndex, startIndex + parseInt(limit));

    // Stats for dashboard
    const stats = {
      total: await CandidateInvite.countDocuments(),
      linkSent: await CandidateInvite.countDocuments({ onboardingStatus: "LINK_SENT" }),
      submitted: await CandidateInvite.countDocuments({ onboardingStatus: "SUBMITTED" }),
      underReview: await CandidateInvite.countDocuments({ onboardingStatus: "UNDER_REVIEW" }),
      approved: await CandidateInvite.countDocuments({ onboardingStatus: "APPROVED" }),
      joined: await CandidateInvite.countDocuments({ onboardingStatus: "JOINED" }),
    };

    res.json({ success: true, data: paginated, total, stats });
  } catch (error) {
    console.error("getQueue error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single candidate detail
// @route   GET /api/onboarding/queue/:id
// @access  Private (Admin, HR, Manager)
exports.getCandidateDetail = async (req, res) => {
  try {
    const invite = await CandidateInvite.findById(req.params.id);
    if (!invite) {
      return res.status(404).json({ success: false, message: "Invite not found" });
    }

    // Decrypt PII for HR view
    const pii = invite.getDecryptedPII();
    const data = invite.toObject();
    Object.assign(data, pii); // Overlay decrypted values

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update candidate status (approve / reject / missing-docs / under-review)
// @route   PUT /api/onboarding/:id/status
// @access  Private (Admin, HR, Manager)
exports.updateStatus = async (req, res) => {
  try {
    const { status, reviewNotes, rejectionReason, missingDocsNote } = req.body;

    const invite = await CandidateInvite.findById(req.params.id);
    if (!invite) return res.status(404).json({ success: false, message: "Invite not found" });

    const allowedTransitions = {
      SUBMITTED: ["UNDER_REVIEW", "MISSING_DOCS", "APPROVED", "REJECTED"],
      UNDER_REVIEW: ["MISSING_DOCS", "APPROVED", "REJECTED"],
      MISSING_DOCS: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
      APPROVED: ["JOINED"],
    };

    const allowed = allowedTransitions[invite.onboardingStatus] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from ${invite.onboardingStatus} to ${status}`,
      });
    }

    invite.onboardingStatus = status;
    if (reviewNotes) invite.reviewNotes = reviewNotes;
    if (rejectionReason) invite.rejectionReason = rejectionReason;
    if (missingDocsNote) invite.missingDocsNote = missingDocsNote;

    if (status === "APPROVED") {
      invite.approvedBy = req.user.id;
      invite.approvedAt = new Date();

      // Send approval email
      try {
        await sendOnboardingApprovalEmail({
          candidateName: invite.fullName,
          candidateEmail: invite.personalEmail,
          joiningDate: invite.joiningDate,
          joiningTime: invite.joiningTime,
          branchLocation: invite.branchLocation,
        });
      } catch (e) {
        console.error("Approval email failed:", e.message);
      }
    }

    await invite.save();

    res.json({ success: true, data: invite, message: `Status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Resend onboarding link
// @route   POST /api/onboarding/:id/resend-link
// @access  Private (Admin, HR)
exports.resendLink = async (req, res) => {
  try {
    const invite = await CandidateInvite.findById(req.params.id);
    if (!invite) return res.status(404).json({ success: false, message: "Invite not found" });

    if (["APPROVED", "JOINED"].includes(invite.onboardingStatus)) {
      return res.status(400).json({ success: false, message: "Cannot resend link for this status" });
    }

    const token = generateToken();
    const expiryHours = parseInt(process.env.ONBOARDING_TOKEN_EXPIRY_HOURS) || 72;
    invite.onboardingToken = token;
    invite.tokenExpiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    invite.onboardingStatus = "LINK_SENT";
    await invite.save();

    const portalUrl = getPortalUrl(token);
    try {
      await sendOnboardingInviteEmail({
        candidateName: invite.fullName,
        candidateEmail: invite.personalEmail,
        portalUrl,
        expiryHours,
        joiningDate: invite.joiningDate,
        invitedByName: req.user.fullName,
        isResend: true,
      });
    } catch (e) {
      console.error("Resend email failed:", e.message);
    }

    res.json({ success: true, portalUrl, message: "New link sent successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Revoke token (invalidate link immediately)
// @route   DELETE /api/onboarding/:id/revoke
// @access  Private (Admin, HR)
exports.revokeToken = async (req, res) => {
  try {
    const invite = await CandidateInvite.findByIdAndUpdate(
      req.params.id,
      { onboardingToken: null, tokenExpiry: new Date(0) },
      { new: true }
    );
    if (!invite) return res.status(404).json({ success: false, message: "Invite not found" });
    res.json({ success: true, message: "Token revoked successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get managers for a department (for dropdown)
// @route   GET /api/onboarding/managers?department=id
// @access  Private
exports.getManagersByDept = async (req, res) => {
  try {
    const { department } = req.query;

    const managerRoles = ["Manager", "Admin", "HR", "IT Manager"];
    let managers;

    if (department) {
      // Get employees in that department who have manager-level user roles
      const deptEmployees = await Employee.find({ department }).populate("userId");
      const managerUserIds = deptEmployees
        .filter((e) => e.userId && managerRoles.includes(e.userId.role))
        .map((e) => e.userId._id);

      managers = await User.find({
        _id: { $in: managerUserIds },
        active: true,
      }).select("fullName email role");
    } else {
      managers = await User.find({
        role: { $in: managerRoles },
        active: true,
      }).select("fullName email role");
    }

    res.json({ success: true, data: managers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    HR finalizes onboarding — creates Employee + User account
// @route   POST /api/onboarding/:id/finalize
// @access  Private (Admin, HR)
exports.finalizeOnboarding = async (req, res) => {
  try {
    const invite = await CandidateInvite.findById(req.params.id);
    if (!invite) return res.status(404).json({ success: false, message: "Invite not found" });

    if (invite.onboardingStatus !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: "Candidate must be APPROVED before finalizing",
      });
    }

    const {
      officialEmail,
      username,
      temporaryPassword,
      reportingManagerId,
      confirmedSalary,
      probationPeriod,
      workMode,
      userRole,
    } = req.body;

    if (!officialEmail || !temporaryPassword) {
      return res.status(400).json({
        success: false,
        message: "Official email and temporary password are required",
      });
    }

    // Check for duplicate official email
    const emailExists = await User.findOne({ email: officialEmail.toLowerCase() });
    if (emailExists) {
      return res.status(400).json({ success: false, message: "Official email already in use" });
    }

    // 1. Decrypt PII from invite
    const pii = invite.getDecryptedPII();

    // 2. Create User account (password hashed by pre('save'))
    const newUser = await User.create({
      fullName: invite.fullName,
      email: officialEmail.toLowerCase(),
      password: temporaryPassword,
      role: userRole || "Employee",
    });

    // 3. Create Employee record (PII encrypted by pre('save'))
    const employeeData = {
      fullName: invite.fullName,
      email: officialEmail.toLowerCase(),
      officialEmail: officialEmail.toLowerCase(),
      phoneNumber: invite.phoneNumber,
      department: invite.department._id || invite.department,
      role: invite.role._id || invite.role,
      employmentType: invite.employmentType,
      salary: confirmedSalary || invite.proposedSalary,
      joiningDate: invite.joiningDate,
      skills: invite.skills || [],
      status: "ACTIVE",
      userId: newUser._id,
      hrId: req.user.id,
    };

    // PII fields (will be re-encrypted by pre('save'))
    if (pii.dob) employeeData.dateOfBirth = pii.dob;
    if (pii.currentAddress) employeeData.currentAddress = pii.currentAddress;
    if (invite.permanentAddress) employeeData.permanentAddress = invite.permanentAddress;
    if (pii.aadharNumber) employeeData.aadharCard = pii.aadharNumber;
    if (pii.panNumber) employeeData.panCard = pii.panNumber;
    if (pii.bankAccountNumber) employeeData.bankAccountNumber = pii.bankAccountNumber;
    if (invite.ifscCode) employeeData.ifscCode = invite.ifscCode;
    if (invite.accountHolderName) employeeData.accountHolderName = invite.accountHolderName;

    // Copy documents from invite
    if (invite.documents) {
      const { resume, photograph, panCard, aadharCard, signature } = invite.documents;
      if (resume) employeeData.resume = resume;
      if (photograph) employeeData.photograph = photograph;
      if (panCard) employeeData.panCard = panCard; // Overrides the aadharCard text field name collision — the document object
      if (aadharCard) employeeData.aadharCard = aadharCard;
      if (signature) employeeData.signature = signature;
    }

    const newEmployee = await Employee.create(employeeData);

    // 4. Link User → Employee
    newUser.employeeId = newEmployee._id;
    await newUser.save();

    // 5. Update invite
    invite.onboardingStatus = "JOINED";
    invite.employeeId = newEmployee._id;
    invite.officialEmail = officialEmail;
    invite.username = username || officialEmail;
    invite.reportingManagerId = reportingManagerId;
    invite.confirmedSalary = confirmedSalary;
    invite.probationPeriod = probationPeriod;
    invite.workMode = workMode;
    invite.joinedAt = new Date();
    // clear sensitive token
    invite.onboardingToken = null;
    await invite.save();

    // 6. Send joining-day welcome email
    try {
      await sendJoiningDayWelcomeEmail({
        user: newUser,
        employee: newEmployee,
        password: temporaryPassword,
        reportingManagerId,
      });
    } catch (e) {
      console.error("Welcome email failed:", e.message);
    }

    // 7. Trigger journey
    try {
      await JourneyService.startJourney("Employee Onboarding", newEmployee._id, req.user.id);
    } catch (e) {
      console.warn("Journey trigger failed (non-critical):", e.message);
    }

    // 8. Notify admins
    await notifyAdmins({
      type: "EMPLOYEE_JOINED",
      message: `${invite.fullName} has officially joined as Employee. Account created by ${req.user.fullName}`,
    });

    res.status(201).json({
      success: true,
      message: "Employee account created successfully",
      data: { invite, employee: newEmployee, user: { _id: newUser._id, email: newUser.email } },
    });
  } catch (error) {
    console.error("finalizeOnboarding error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC PORTAL ENDPOINTS (token-based, no JWT session)
// ═══════════════════════════════════════════════════════════════════════════

// @desc    Get portal data (validate token + return prefilled data)
// @route   GET /api/onboarding/portal/:token
// @access  Public
exports.getPortalData = async (req, res) => {
  try {
    const invite = await CandidateInvite.findOne({
      onboardingToken: req.params.token,
    });

    if (!invite) {
      return res.status(404).json({ success: false, message: "Invalid or expired link. Please contact HR." });
    }

    if (invite.isTokenExpired) {
      return res.status(410).json({ success: false, message: "This link has expired. Please contact HR for a new link.", expired: true });
    }

    if (["APPROVED", "JOINED"].includes(invite.onboardingStatus)) {
      return res.status(200).json({
        success: false,
        message: "Your onboarding is complete. No further action needed.",
        completed: true,
      });
    }

    // Mark as OPENED if first time
    if (invite.onboardingStatus === "LINK_SENT") {
      invite.onboardingStatus = "OPENED";
      invite.tokenOpenedAt = new Date();
      invite.ipAddress = req.ip;
      invite.userAgent = req.headers["user-agent"];
      await invite.save();
    }

    // Return safe data (no encrypted PII raw values, no token)
    res.json({
      success: true,
      data: {
        _id: invite._id,
        fullName: invite.fullName,
        personalEmail: invite.personalEmail,
        phoneNumber: invite.phoneNumber,
        department: invite.department,
        role: invite.role,
        employmentType: invite.employmentType,
        proposedSalary: invite.proposedSalary,
        joiningDate: invite.joiningDate,
        joiningTime: invite.joiningTime,
        branchLocation: invite.branchLocation,
        onboardingStatus: invite.onboardingStatus,
        lastDraftStep: invite.lastDraftStep,
        gender: invite.gender,
        permanentAddress: invite.permanentAddress,
        emergencyContact: invite.emergencyContact,
        qualification: invite.qualification,
        experience: invite.experience,
        skills: invite.skills,
        bankName: invite.bankName,
        ifscCode: invite.ifscCode,
        accountHolderName: invite.accountHolderName,
        documents: invite.documents,
        declarationAccepted: invite.declarationAccepted,
        submittedAt: invite.submittedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Save draft (candidate saves progress mid-form)
// @route   POST /api/onboarding/portal/:token/save
// @access  Public (token validated)
exports.saveDraft = async (req, res) => {
  try {
    const invite = await CandidateInvite.findOne({ onboardingToken: req.params.token });

    if (!invite || invite.isTokenExpired) {
      return res.status(410).json({ success: false, message: "Invalid or expired link." });
    }

    if (invite.onboardingStatus === "SUBMITTED") {
      return res.status(400).json({ success: false, message: "Form already submitted." });
    }

    const {
      gender, currentAddress, permanentAddress, dob, emergencyContact,
      qualification, experience, skills,
      panNumber, aadharNumber, bankName, bankAccountNumber, ifscCode, accountHolderName,
      lastDraftStep,
    } = req.body;

    // Update allowed candidate fields
    if (gender !== undefined) invite.gender = gender;
    if (permanentAddress !== undefined) invite.permanentAddress = permanentAddress;
    if (emergencyContact !== undefined) invite.emergencyContact = emergencyContact;
    if (qualification !== undefined) invite.qualification = qualification;
    if (experience !== undefined) invite.experience = experience;
    if (skills !== undefined) invite.skills = Array.isArray(skills) ? skills : skills.split(",").map(s => s.trim());
    if (bankName !== undefined) invite.bankName = bankName;
    if (ifscCode !== undefined) invite.ifscCode = ifscCode;
    if (accountHolderName !== undefined) invite.accountHolderName = accountHolderName;
    if (lastDraftStep !== undefined) invite.lastDraftStep = lastDraftStep;

    // PII fields (will be encrypted by pre('save'))
    if (dob) { invite.dob = dob; invite.markModified("dob"); }
    if (currentAddress) { invite.currentAddress = currentAddress; invite.markModified("currentAddress"); }
    if (panNumber) { invite.panNumber = panNumber; invite.markModified("panNumber"); }
    if (aadharNumber) { invite.aadharNumber = aadharNumber; invite.markModified("aadharNumber"); }
    if (bankAccountNumber) { invite.bankAccountNumber = bankAccountNumber; invite.markModified("bankAccountNumber"); }

    if (["OPENED", "LINK_SENT"].includes(invite.onboardingStatus)) {
      invite.onboardingStatus = "IN_PROGRESS";
    }

    await invite.save();

    res.json({ success: true, message: "Progress saved" });
  } catch (error) {
    console.error("saveDraft error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Submit completed form with documents
// @route   POST /api/onboarding/portal/:token/submit
// @access  Public (token validated)
exports.submitForm = async (req, res) => {
  try {
    const invite = await CandidateInvite.findOne({ onboardingToken: req.params.token });

    if (!invite || invite.isTokenExpired) {
      return res.status(410).json({ success: false, message: "Invalid or expired link." });
    }

    if (invite.onboardingStatus === "SUBMITTED") {
      return res.status(400).json({ success: false, message: "Already submitted." });
    }

    const { declarationAccepted, privacyAccepted, joiningTermsAccepted } = req.body;

    if (!declarationAccepted || !privacyAccepted || !joiningTermsAccepted) {
      return res.status(400).json({ success: false, message: "All declarations must be accepted." });
    }

    // Save draft fields first
    const draftFields = [
      "gender","permanentAddress","emergencyContact","qualification",
      "experience","skills","bankName","ifscCode","accountHolderName",
    ];
    draftFields.forEach(f => {
      if (req.body[f] !== undefined) invite[f] = req.body[f];
    });

    // PII
    if (req.body.dob) { invite.dob = req.body.dob; invite.markModified("dob"); }
    if (req.body.currentAddress) { invite.currentAddress = req.body.currentAddress; invite.markModified("currentAddress"); }
    if (req.body.panNumber) { invite.panNumber = req.body.panNumber; invite.markModified("panNumber"); }
    if (req.body.aadharNumber) { invite.aadharNumber = req.body.aadharNumber; invite.markModified("aadharNumber"); }
    if (req.body.bankAccountNumber) { invite.bankAccountNumber = req.body.bankAccountNumber; invite.markModified("bankAccountNumber"); }

    // Upload documents
    if (req.files) {
      if (!invite.documents) invite.documents = {};
      for (const [fieldName, filesArr] of Object.entries(req.files)) {
        for (const file of filesArr) {
          try {
            const result = await fileStorage.uploadEmployeeDoc(file, fieldName);
            if (fieldName === "educationalDocs") {
              if (!invite.documents.educationalDocs) invite.documents.educationalDocs = [];
              invite.documents.educationalDocs.push(result);
            } else {
              invite.documents[fieldName] = result;
            }
          } catch (uploadErr) {
            console.error(`Failed to upload ${fieldName}:`, uploadErr.message);
          }
        }
      }
      invite.markModified("documents");
    }

    invite.declarationAccepted = declarationAccepted;
    invite.privacyAccepted = privacyAccepted;
    invite.joiningTermsAccepted = joiningTermsAccepted;
    invite.onboardingStatus = "SUBMITTED";
    invite.submittedAt = new Date();

    await invite.save();

    // Notify HR
    await notifyAdmins({
      type: "CANDIDATE_SUBMITTED",
      message: `${invite.fullName} has submitted their onboarding form. Please review.`,
    });

    res.json({ success: true, message: "Form submitted successfully! HR will review and contact you soon." });
  } catch (error) {
    console.error("submitForm error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
