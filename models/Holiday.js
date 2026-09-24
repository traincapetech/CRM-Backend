const mongoose = require("mongoose");

const HolidaySchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, "Please add a date"],
      unique: true,
    },
    dateKey: {
      type: String, // YYYY-MM-DD
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: [true, "Please add a name"],
      trim: true,
    },
    type: {
      type: String,
      enum: ["full-day", "half-day", "optional"],
      default: "full-day",
    },
    description: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Pre-save to ensure dateKey is consistent
HolidaySchema.pre("save", function (next) {
  if (this.date) {
    this.dateKey = this.date.toISOString().split("T")[0];
  }
  next();
});

module.exports = mongoose.model("Holiday", HolidaySchema);
