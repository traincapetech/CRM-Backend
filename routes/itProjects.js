const express = require('express');
const { listProjects, createProject, updateProject, deleteProject } = require('../controllers/itProjects');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.route('/')
  .get(protect, listProjects)
  .post(protect, createProject);

router.route('/:id')
  .put(protect, updateProject)
  .delete(protect, deleteProject);

module.exports = router;
