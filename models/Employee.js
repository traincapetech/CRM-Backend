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
  employmentType: {
    type: String,
    enum: ['PERMANENT', 'INTERN', 'CONTRACT'],
    default: 'PERMANENT'
  },
  department: {
    type: mongoose.Schema.ObjectId,
    ref: 'Department',
    required: [true, 'Please assign a department']
  },
  role: {
    type: mongoose.Schema.ObjectId,
    ref: 'EmployeeRole',
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
  internshipStartDate: {
    type: Date
  },
  internshipEndDate: {
    type: Date
  },
  skills: [{
    type: String,
    trim: true
  }],
  projectAssignments: [{
    projectName: {
      type: String,
      required: true,
      trim: true
    },
    role: {
      type: String,
      trim: true
    },
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'ON_HOLD'],
      default: 'ACTIVE'
    }
  }],
  // Document Storage (supporting both simple strings and detailed objects)
  photograph: {
    type: mongoose.Schema.Types.Mixed
  },
  tenthMarksheet: {
    type: mongoose.Schema.Types.Mixed
  },
  twelfthMarksheet: {
    type: mongoose.Schema.Types.Mixed
  },
  bachelorDegree: {
    type: mongoose.Schema.Types.Mixed
  },
  postgraduateDegree: {
    type: mongoose.Schema.Types.Mixed
  },
  aadharCard: {
    type: mongoose.Schema.Types.Mixed
  },
  panCard: {
    type: mongoose.Schema.Types.Mixed
  },
  pcc: {
    type: mongoose.Schema.Types.Mixed
  },
  resume: {
    type: mongoose.Schema.Types.Mixed
  },
  offerLetter: {
    type: mongoose.Schema.Types.Mixed
  },
  // General documents object for additional flexibility
  documents: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
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