const mongoose = require("mongoose");

const QuestionnaireResponseSchema = new mongoose.Schema(
  {
    questionnaireId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Questionnaire",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: {
      type: String,
      required: true,
    },
    answers: [
      {
        questionId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        questionText: {
          type: String,
          required: true,
        },
        answerText: {
          type: String,
          default: "",
        },
        selectedOptions: [String], // For future MCQ/Rating
      },
    ],
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
QuestionnaireResponseSchema.index({ questionnaireId: 1, userId: 1 }, { unique: true });
QuestionnaireResponseSchema.index({ questionnaireId: 1 });
QuestionnaireResponseSchema.index({ userId: 1 });

module.exports = mongoose.model(
  "QuestionnaireResponse",
  QuestionnaireResponseSchema,
);
