const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema({
  questionText: {
    type: String,
    required: true,
    trim: true,
  },
  questionType: {
    type: String,
    enum: ["text", "mcq", "rating", "file"],
    default: "text",
  },
  options: [
    {
      text: String,
    },
  ],
  order: {
    type: Number,
    default: 0,
  },
  required: {
    type: Boolean,
    default: true,
  },
});

const QuestionnaireSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please add a title"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    questions: [QuestionSchema],
    assignedToUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    assignedToRoles: [
      {
        type: String,
        trim: true,
      },
    ],
    deadline: {
      type: Date,
      default: null,
    },
    allowEditingAfterSubmission: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "published",
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for faster lookups
QuestionnaireSchema.index({ assignedToUsers: 1 });
QuestionnaireSchema.index({ assignedToRoles: 1 });
QuestionnaireSchema.index({ createdBy: 1 });

module.exports = mongoose.model("Questionnaire", QuestionnaireSchema);
