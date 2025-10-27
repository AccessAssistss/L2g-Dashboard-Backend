const express = require("express");
const {
    activateENach,
    checkENachStatus,
    resendENachLink,
    getLoansForENachActivation,
    getPendingENachLoans,
    getENachActiveLoans
} = require("../controllers/eNachController");

const router = express.Router();

router.post("/activateENach/:loanApplicationId", activateENach);
router.get("/checkENachStatus/:loanApplicationId", checkENachStatus);
router.post("/resendENachLink/:loanApplicationId", resendENachLink);
router.get("/getLoansForENachActivation", getLoansForENachActivation);
router.get("/getPendingENachLoans", getPendingENachLoans);
router.get("/getENachActiveLoans", getENachActiveLoans);

module.exports = router;