const mongoose = require("mongoose");

const defaultSections = [
  { sectionKey: "work_performance", title: "Work Performance & Quality", description: "Evaluates quality, accuracy, speed, and standard of work output.", weight: 1, requiresRating: true, requiresComment: true },
  { sectionKey: "technical_skills", title: "Technical Skills & Competency", description: "Assesses domain knowledge, technical proficiency, and skill execution.", weight: 1, requiresRating: true, requiresComment: true },
  { sectionKey: "communication", title: "Communication & Collaboration", description: "Measures clarity, responsiveness, active listening, and team engagement.", weight: 1, requiresRating: true, requiresComment: true },
  { sectionKey: "discipline", title: "Punctuality, Discipline & Ethics", description: "Evaluates adherence to company policies, attendance, and professionalism.", weight: 1, requiresRating: true, requiresComment: true },
  { sectionKey: "teamwork", title: "Teamwork & Interpersonal Skills", description: "Assesses cross-team support, conflict resolution, and positive culture.", weight: 1, requiresRating: true, requiresComment: true },
  { sectionKey: "learning", title: "Learning & Adaptability", description: "Measures continuous learning, openness to feedback, and adaptability.", weight: 1, requiresRating: true, requiresComment: true },
  { sectionKey: "problem_solving", title: "Problem Solving & Initiative", description: "Evaluates analytical thinking, proactive solutioning, and initiative.", weight: 1, requiresRating: true, requiresComment: true },
  { sectionKey: "leadership", title: "Leadership & Ownership", description: "Assesses responsibility, ownership of deliverables, and guidance to peers.", weight: 1, requiresRating: true, requiresComment: true },
  { sectionKey: "strengths", title: "Core Strengths", description: "Key positive attributes and notable achievements.", weight: 1, requiresRating: false, requiresComment: true },
  { sectionKey: "improvement_areas", title: "Areas for Improvement", description: "Specific skills or behaviors requiring development.", weight: 1, requiresRating: false, requiresComment: true },
  { sectionKey: "goals", title: "Future Goals & Objectives", description: "Targets and milestones set for the next review period.", weight: 1, requiresRating: false, requiresComment: true },
  { sectionKey: "overall_comments", title: "Overall Summary & Comments", description: "Final qualitative remarks by evaluator.", weight: 1, requiresRating: false, requiresComment: true },
];

const defaultSelfReviewQuestions = [
  { questionId: "achievements", questionText: "What were your major achievements during this review period?" },
  { questionId: "challenges", questionText: "What were the biggest challenges you faced and how did you overcome them?" },
  { questionId: "skills_learned", questionText: "What new skills, tools, or learnings did you acquire?" },
  { questionId: "next_goals", questionText: "What are your primary goals and focus areas for the next review period?" },
  { questionId: "support_needed", questionText: "Is there any support, training, or resources you need from management or HR?" },
];

const reviewTemplateSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please add a template title"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sections: [
      {
        sectionKey: { type: String, required: true },
        title: { type: String, required: true },
        description: { type: String, default: "" },
        weight: { type: Number, default: 1 },
        requiresRating: { type: Boolean, default: true },
        requiresComment: { type: Boolean, default: true },
      },
    ],
    selfReviewQuestions: [
      {
        questionId: { type: String, required: true },
        questionText: { type: String, required: true },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "review_templates",
  }
);

reviewTemplateSchema.statics.getDefaultSections = () => defaultSections;
reviewTemplateSchema.statics.getDefaultSelfReviewQuestions = () => defaultSelfReviewQuestions;

module.exports = mongoose.model("ReviewTemplate", reviewTemplateSchema);
