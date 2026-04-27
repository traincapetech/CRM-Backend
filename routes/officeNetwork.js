const express = require("express");
const {
  getOfficeNetworks,
  createOfficeNetwork,
  updateOfficeNetwork,
  deleteOfficeNetwork,
} = require("../controllers/officeNetwork");

const router = express.Router();

const { protect, authorize } = require("../middleware/auth");

// Only Admin can manage office networks
router.use(protect);
router.use(authorize("Admin"));

router.route("/").get(getOfficeNetworks).post(createOfficeNetwork);

router.route("/:id").put(updateOfficeNetwork).delete(deleteOfficeNetwork);

module.exports = router;
