const mongoose = require("mongoose");
const { encrypt, decrypt, hashForSearch } = require("../utils/encryption");

const LeadSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please add a lead name"],
    trim: true,
    maxlength: [100, "Name cannot be more than 100 characters"],
  },
  // PII - encrypted at rest
  email: {
    type: String, // Encrypted
  },
  emailHash: {
    type: String, // Hash for searching
    index: true,
  },
  course: {
    type: String,
    trim: true,
    required: [true, "Please specify the course"],
  },
  countryCode: {
    type: String,
    trim: true,
    required: [true, "Please add country code"],
  },
  // PII - encrypted at rest
  phone: {
    type: String, // Encrypted
  },
  phoneHash: {
    type: String, // Hash for searching
    index: true,
  },
  country: {
    type: String,
    trim: true,
    required: [true, "Please add the country"],
  },
  pseudoId: {
    type: String,
    trim: true,
  },
  company: {
    type: String,
    trim: true,
  },
  client: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: [
      "New",
      "Contacted",
      "Qualified",
      "Lost",
      "Converted",
      "Introduction",
      "Acknowledgement",
      "Question",
      "Future Promise",
      "Payment",
      "Analysis",
    ],
    default: "Introduction",
  },
  source: {
    type: String,
    default: "",
  },
  sourceLink: {
    type: String,
    trim: true,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  leadPerson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  remarks: {
    type: String,
  },
  feedback: {
    type: String,
  },
  // Fields to track repeat customers
  isRepeatCustomer: {
    type: Boolean,
    default: false,
  },
  previousCourses: [
    {
      type: String,
      trim: true,
    },
  ],
  relatedLeads: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Encrypt PII before saving and generate search hashes
LeadSchema.pre("save", function (next) {
  try {
    // Encrypt and hash email
    if (this.isModified("email") && this.email) {
      this.emailHash = hashForSearch(this.email);
      this.email = encrypt(this.email);
    }
    // Encrypt and hash phone
    if (this.isModified("phone") && this.phone) {
      this.phoneHash = hashForSearch(this.phone);
      this.phone = encrypt(this.phone);
    }
    next();
  } catch (error) {
    console.error("Error encrypting Lead PII:", error);
    next(error);
  }
});

// Decrypt PII for authorized access
LeadSchema.methods.getDecryptedPII = function () {
  return {
    email: this.email ? decrypt(this.email) : null,
    phone: this.phone ? decrypt(this.phone) : null,
  };
};

// Static method to find by email (using hash)
LeadSchema.statics.findByEmail = function (email) {
  const hash = hashForSearch(email);
  return this.find({ emailHash: hash });
};

// Static method to find by phone (using hash)
LeadSchema.statics.findByPhone = function (phone) {
  const hash = hashForSearch(phone);
  return this.find({ phoneHash: hash });
};

// PERFORMANCE OPTIMIZATION: Add indexes for faster queries
LeadSchema.index({ assignedTo: 1, createdAt: -1 });
LeadSchema.index({ leadPerson: 1, createdAt: -1 });
LeadSchema.index({ createdBy: 1, createdAt: -1 });
LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Lead", LeadSchema);
