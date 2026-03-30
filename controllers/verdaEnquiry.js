const VerdaEnquiry = require('../models/VerdaEnquiry');

// @desc    Get all enquiries
// @route   GET /api/verda-enquiries
// @access  Private (Admin, Manager, Sales Person)
exports.getEnquiries = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const startIndex = (page - 1) * limit;

    const total = await VerdaEnquiry.countDocuments();
    const enquiries = await VerdaEnquiry.find()
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit);

    res.status(200).json({
      success: true,
      count: enquiries.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: enquiries
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Get single enquiry
// @route   GET /api/verda-enquiries/:id
// @access  Private (Admin, Manager, Sales Person)
exports.getEnquiry = async (req, res) => {
  try {
    const enquiry = await VerdaEnquiry.findById(req.params.id);

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: `No enquiry found with id of ${req.params.id}`
      });
    }

    res.status(200).json({
      success: true,
      data: enquiry
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Create new enquiry
// @route   POST /api/verda-enquiries
// @access  Public
exports.createEnquiry = async (req, res) => {
  try {
    // Sanitize input: Public submission should not set status or feedback
    const enquiryData = {
      ...req.body,
      status: 'Pending',
      feedback: undefined
    };

    const enquiry = await VerdaEnquiry.create(enquiryData);

    // Emit Socket.IO event for Real-Time Notification
    try {
      const io = req.app.get("io");
      if (io) {
        io.emit("new_verda_enquiry", {
          _id: enquiry._id,
          name: enquiry.name,
          company: enquiry.company,
          countryCode: enquiry.countryCode,
          number: enquiry.number,
          email: enquiry.email,
          address: enquiry.address,
          interestedProducts: enquiry.interestedProducts,
          status: enquiry.status,
          feedback: enquiry.feedback,
          createdAt: enquiry.createdAt
        });
        console.log("📡 Emitted new_verda_enquiry event with full details");
      }
    } catch (socketErr) {
      console.error("Socket emission error (non-blocking):", socketErr);
    }

    res.status(201).json({
      success: true,
      data: enquiry
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Update enquiry status/details
// @route   PUT /api/verda-enquiries/:id
// @access  Private (Admin, Manager, Sales Person)
exports.updateEnquiry = async (req, res) => {
  try {
    console.log(`📝 Update request for Enquiry ID: ${req.params.id}`);
    console.log('Update Data:', req.body);

    let enquiry = await VerdaEnquiry.findById(req.params.id);

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: `No enquiry found with id of ${req.params.id}`
      });
    }

    enquiry = await VerdaEnquiry.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: enquiry
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Delete enquiry
// @route   DELETE /api/verda-enquiries/:id
// @access  Private (Admin, Manager)
exports.deleteEnquiry = async (req, res) => {
  try {
    const enquiry = await VerdaEnquiry.findById(req.params.id);

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: `No enquiry found with id of ${req.params.id}`
      });
    }

    await enquiry.deleteOne();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};
