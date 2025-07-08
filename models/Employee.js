const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Please add a full name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  whatsappNumber: {
    type: String,
    trim: true
  },
  linkedInUrl: {
    type: String,
    trim: true
  },
  currentAddress: {
    type: String,
    trim: true
  },
  permanentAddress: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  joiningDate: {
    type: Date,
    default: Date.now
  },
  salary: {
    type: Number,
    min: 0
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'TERMINATED'],
    default: 'ACTIVE'
  },
  department: {
    type: mongoose.Schema.ObjectId,
    ref: 'Department',
    required: [true, 'Please assign a department']
  },
  role: {
    type: mongoose.Schema.ObjectId,
    ref: 'Role',
    required: [true, 'Please assign a role']
  },
  hrId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  // Educational Information
  collegeName: {
    type: String,
    trim: true
  },
  internshipDuration: {
    type: Number // in months
  },
  // Document Storage (as file paths or base64)
  photograph: {
    type: String
  },
  tenthMarksheet: {
    type: String
  },
  twelfthMarksheet: {
    type: String
  },
  bachelorDegree: {
    type: String
  },
  postgraduateDegree: {
    type: String
  },
  aadharCard: {
    type: String
  },
  panCard: {
    type: String
  },
  pcc: {
    type: String
  },
  resume: {
    type: String
  },
  offerLetter: {
    type: String
  },
  // User account reference
  userId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Populate department and role on find
employeeSchema.pre(/^find/, function(next) {
  this.populate({
    path: 'department',
    select: 'name description'
  }).populate({
    path: 'role',
    select: 'name description'
  }).populate({
    path: 'hrId',
    select: 'fullName email'
  });
  next();
});

module.exports = mongoose.model('Employee', employeeSchema); 