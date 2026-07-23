const mongoose = require("mongoose");

const employmentHistorySchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    changeType: {
      type: String,
      enum: [
        "DEPARTMENT",
        "DESIGNATION",
        "REPORTING_MANAGER",
        "EMPLOYMENT_TYPE",
        "STATUS",
        "INITIAL_HIRE",
        "COMPREHENSIVE_UPDATE",
        "PROMOTION",
        "DEPARTMENT_TRANSFER",
      ],
      required: true,
    },
    fieldName: {
      type: String,
      enum: ["department", "role", "reportingManager", "employmentType", "status", "all"],
      required: true,
    },
    previousValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    previousValueText: {
      type: String,
      default: "N/A",
    },
    newValueText: {
      type: String,
      default: "N/A",
    },
    effectiveDate: {
      type: Date,
      default: Date.now,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

employmentHistorySchema.index({ employeeId: 1, createdAt: -1 });

module.exports = mongoose.model("EmploymentHistory", employmentHistorySchema);
