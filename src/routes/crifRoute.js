const express = require("express");
const router = express.Router();
const validateToken = require("../../middleware/validateJwtToken");
const { fetchApplicantCrifReport, fetchGuardianCrifReport } = require("../controllers/crifController");

router.post("/fetchApplicantCrifReport/:loanApplicationId", validateToken, fetchApplicantCrifReport);
router.post("/fetchGuardianCrifReport/:loanApplicationId", validateToken, fetchGuardianCrifReport);

module.exports = router;