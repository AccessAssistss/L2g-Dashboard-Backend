const express = require("express");
const router = express.Router();
const { registerAdmin, loginAdmin } = require("../controllers/adminController");

router.post("/registerAdmin", registerAdmin);
router.post("/loginAdmin", loginAdmin);

module.exports = router;