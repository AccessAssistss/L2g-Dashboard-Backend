const express = require("express");
const {
    activateENach,
    checkENachStatus,
    resendENachLink,
    getLoansForENachActivation,
    getPendingENachLoans,
    getENachActiveLoans,
    testICICIENach
} = require("../controllers/eNachController");
const validateToken = require("../../middleware/validateJwtToken");

const router = express.Router();

router.post("/activateENach/:loanApplicationId", validateToken, activateENach);
router.get("/checkENachStatus/:loanApplicationId", validateToken, checkENachStatus);
router.post("/resendENachLink/:loanApplicationId", validateToken, resendENachLink);
router.get("/getLoansForENachActivation", validateToken, getLoansForENachActivation);
router.get("/getPendingENachLoans", validateToken, getPendingENachLoans);
router.get("/getENachActiveLoans", validateToken, getENachActiveLoans);
router.post("/testICICIENach", testICICIENach);

module.exports = router;