const mongoose = require("mongoose");

const CourseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please add a course name"],
    trim: true,
    unique: true
  },
  price: {
    type: Number,
    required: [true, "Please add a course price"],
    min: [0, "Price cannot be negative"]
  },
  description: {
    type: String,
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("Course", CourseSchema);
