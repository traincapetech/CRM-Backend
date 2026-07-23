const mongoose = require("mongoose");

const assetMaintenanceSchema = new mongoose.Schema(
  {
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asset",
      required: true,
      index: true,
    },
    repairDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    vendor: {
      type: String,
      trim: true,
      default: "",
    },
    cost: {
      type: Number,
      min: 0,
      default: 0,
    },
    description: {
      type: String,
      required: [true, "Maintenance description is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "SCHEDULED",
      index: true,
    },
    completionDate: {
      type: Date,
      default: null,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "asset_maintenances",
  }
);

assetMaintenanceSchema.index({ assetId: 1, createdAt: -1 });

module.exports = mongoose.model("AssetMaintenance", assetMaintenanceSchema);
