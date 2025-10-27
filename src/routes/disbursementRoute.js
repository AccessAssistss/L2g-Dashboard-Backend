const express = require("express");
const { disburseLoan, getDisbursedLoans, getDisbursedLoanDetails } = require("../controllers/disbursementController");

const router = express.Router();

router.post("/disburseLoan/:loanApplicationId", disburseLoan);
router.get("/getDisbursedLoans", getDisbursedLoans);
router.get("/getDisbursedLoanDetails/:id", getDisbursedLoanDetails);

module.exports = router;