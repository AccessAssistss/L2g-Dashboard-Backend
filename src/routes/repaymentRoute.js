const express = require("express");
const { addUTRDetails, processRepayment, getRepaymentHistory, getClosedLoans, getClosureCertificate } = require("../controllers/repaymentController");
const multerErrorHandler = require("../../middleware/multerErrorHandler");
const createUploadMiddleware = require("../../middleware/upload");
const { PAYMENT_RECIEPT } = require("../../utils/fileFieldMapper")

const router = express.Router();

const uploadEmployerFiles = createUploadMiddleware("payment", PAYMENT_RECIEPT);

router.post("/addUTRDetails/:loanApplicationId", uploadEmployerFiles, multerErrorHandler, addUTRDetails);
router.post("/processRepayment/:loanApplicationId", uploadEmployerFiles, multerErrorHandler, processRepayment);
router.get("/getRepaymentHistory/:loanApplicationId", getRepaymentHistory);
router.get("/getClosedLoans", getClosedLoans);
router.get("/getClosureCertificate/:loanApplicationId", getClosureCertificate);

module.exports = router;