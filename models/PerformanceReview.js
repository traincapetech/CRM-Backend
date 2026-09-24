const mongoose = require("mongoose");

const performanceReviewSchema = new mongoose.Schema(
  {
    reviewCycleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReviewCycle",
      required: true,
      index: true,
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReviewTemplate",
      required: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    hrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "SELF_REVIEW_PENDING",
        "MANAGER_REVIEW_PENDING",
        "HR_REVIEW_PENDING",
        "REVISION_REQUIRED",
        "FINALIZED",
        "CANCELLED",
      ],
      default: "SELF_REVIEW_PENDING",
      index: true,
    },

    // Employee Self Review
    selfReview: {
      submittedAt: { type: Date, default: null },
      answers: [
        {
          questionId: String,
          questionText: String,
          answerText: String,
        },
      ],
      overallComments: { type: String, default: "" },
    },

    // Manager Evaluation
    managerReview: {
      submittedAt: { type: Date, default: null },
      evaluatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      sectionRatings: [
        {
          sectionKey: String,
          rating: { type: Number, min: 1, max: 5 },
          comments: String,
        },
      ],
      overallRating: { type: Number, min: 1, max: 5, default: null },
      summaryFeedback: { type: String, default: "" },
      strengths: { type: String, default: "" },
      areasForGrowth: { type: String, default: "" },
    },

    // HR Review & Policy Compliance Check
    hrReview: {
      reviewedAt: { type: Date, default: null },
      reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      attendanceScore: { type: Number, default: null },
      policyCompliance: { type: Boolean, default: true },
      trainingCompletion: { type: Boolean, default: true },
      hrComments: { type: String, default: "" },
      revisionNotes: { type: String, default: "" },
    },

    // Final Outcome & Recommendation
    finalRecommendation: {
      ratingCategory: {
        type: String,
        enum: [
          "EXCELLENT",
          "GOOD",
          "AVERAGE",
          "NEEDS_IMPROVEMENT",
          "PIP_RECOMMENDED",
          "NOT_SET",
        ],
        default: "NOT_SET",
      },
      finalRating: { type: Number, min: 1, max: 5, default: null },
      finalizedAt: { type: Date, default: null },
      finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      summaryNotes: { type: String, default: "" },
    },

    // PIP Integration
    isPIPTriggered: {
      type: Boolean,
      default: false,
    },
    pipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PIP",
      default: null,
    },

    // Audit Trail
    historyLog: [
      {
        action: { type: String, required: true },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
        notes: { type: String, default: "" },
      },
    ],
  },
  {
    timestamps: true,
    collection: "performance_reviews",
  }
);

performanceReviewSchema.index({ employeeId: 1, reviewCycleId: 1 }, { unique: true });
performanceReviewSchema.index({ managerId: 1, status: 1 });
performanceReviewSchema.index({ status: 1 });

module.exports = mongoose.model("PerformanceReview", performanceReviewSchema);
