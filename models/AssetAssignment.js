const mongoose = require("mongoose");

const assetAssignmentSchema = new mongoose.Schema(
  {
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asset",
      required: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expectedReturnDate: {
      type: Date,
      default: null,
    },
    actualReturnDate: {
      type: Date,
      default: null,
    },
    assignmentNotes: {
      type: String,
      trim: true,
      default: "",
    },
    returnCondition: {
      type: String,
      enum: [
        "EXCELLENT",
        "GOOD",
        "FAIR",
        "DAMAGED",
        "DEFECTIVE",
        "NOT_APPLICABLE",
      ],
      default: "NOT_APPLICABLE",
    },
    returnRemarks: {
      type: String,
      trim: true,
      default: "",
    },
    returnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "RETURNED"],
      default: "ACTIVE",
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "asset_assignments",
  }
);

assetAssignmentSchema.index({ assetId: 1, createdAt: -1 });
assetAssignmentSchema.index({ employeeId: 1, status: 1 });

module.exports = mongoose.model("AssetAssignment", assetAssignmentSchema);
