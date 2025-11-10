const express = require("express");
const { disburseLoan, getDisbursedLoans, getDisbursedLoanDetails } = require("../controllers/disbursementController");
const validateToken = require("../../middleware/validateJwtToken");

const router = express.Router();

router.post("/disburseLoan/:loanApplicationId", validateToken, disburseLoan);
router.get("/getDisbursedLoans", validateToken, getDisbursedLoans);
router.get("/getDisbursedLoanDetails/:id", validateToken, getDisbursedLoanDetails);

module.exports = router;