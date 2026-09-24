const express = require("express");
const router = express.Router();
const {
  createQuestionnaire,
  getQuestionnaires,
  getQuestionnaire,
  updateQuestionnaire,
  deleteQuestionnaire,
  submitResponse,
  getQuestionnaireResponses,
  getMyResponse,
} = require("../controllers/questionnaireController");

const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router
  .route("/")
  .get(getQuestionnaires)
  .post(authorize("Admin"), createQuestionnaire);

router
  .route("/:id")
  .get(getQuestionnaire)
  .put(authorize("Admin"), updateQuestionnaire)
  .delete(authorize("Admin"), deleteQuestionnaire);

router.post("/:id/submit", submitResponse);
router.get("/:id/my-response", getMyResponse);

router.get("/:id/responses", authorize("Admin"), getQuestionnaireResponses);

module.exports = router;
