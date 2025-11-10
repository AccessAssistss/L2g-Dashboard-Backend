const express = require("express");
const router = express.Router();
const validateToken = require("../../middleware/validateJwtToken");
const { getLoanSummary } = require("../controllers/analyticsController");

router.get("/getLoanSummary", validateToken, getLoanSummary);

module.exports = router;