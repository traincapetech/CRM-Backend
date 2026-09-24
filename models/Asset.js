const mongoose = require("mongoose");

const assetSchema = new mongoose.Schema(
  {
    assetId: {
      type: String,
      required: [true, "Asset ID code is required"],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Asset name is required"],
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AssetCategory",
      required: [true, "Asset category is required"],
      index: true,
    },
    brand: {
      type: String,
      trim: true,
      default: "",
    },
    model: {
      type: String,
      trim: true,
      default: "",
    },
    serialNumber: {
      type: String,
      trim: true,
      sparse: true,
    },
    purchaseDate: {
      type: Date,
      default: null,
    },
    warrantyExpiry: {
      type: Date,
      default: null,
      index: true,
    },
    purchaseCost: {
      type: Number,
      min: 0,
      default: 0,
    },
    vendor: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: [
        "AVAILABLE",
        "ASSIGNED",
        "UNDER_MAINTENANCE",
        "DAMAGED",
        "LOST",
        "RETIRED",
        "DISPOSED",
      ],
      default: "AVAILABLE",
      index: true,
    },
    currentAssignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
      index: true,
    },
    currentAssignmentDate: {
      type: Date,
      default: null,
    },
    officeLocation: {
      type: String,
      trim: true,
      default: "Main Office",
    },
    condition: {
      type: String,
      enum: ["NEW", "EXCELLENT", "GOOD", "FAIR", "DAMAGED", "DEFECTIVE"],
      default: "NEW",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "assets",
  }
);

assetSchema.index({ name: "text", serialNumber: "text", assetId: "text" });

module.exports = mongoose.model("Asset", assetSchema);
