const mongoose = require("mongoose");

const officeNetworkSchema = new mongoose.Schema(
  {
    officeName: {
      type: String,
      required: [true, "Office name is required"],
      unique: true,
      trim: true,
    },
    privateRanges: [
      {
        type: String,
        trim: true,
      },
    ],
    publicIPs: [
      {
        type: String,
        trim: true,
      },
    ],
    status: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("OfficeNetwork", officeNetworkSchema);
