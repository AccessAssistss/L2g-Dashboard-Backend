const express = require("express");
const {
    createLoanApplication,
    getPendingLoans,
    getPendingLoanDetails,
    submitKYC,
    approveLoan,
    getApprovedLoans,
    getApprovedLoanDetails,
} = require("../controllers/loanApplicationController");
const multerErrorHandler = require("../../middleware/multerErrorHandler");
const createUploadMiddleware = require("../../middleware/upload");
const { KYC_FILE_FIELDS } = require("../../utils/fileFieldMapper")

const router = express.Router();

const uploadEmployerFiles = createUploadMiddleware("kyc", KYC_FILE_FIELDS);

router.post("/createLoanApplication", createLoanApplication);
router.post("/submitKYC/:loanApplicationId", uploadEmployerFiles, multerErrorHandler, submitKYC);
router.post("/approveLoan/:id", approveLoan);
router.get("/getPendingLoans", getPendingLoans);
router.get("/getPendingLoanDetails/:id", getPendingLoanDetails);
router.get("/getApprovedLoans", getApprovedLoans);
router.get("/getApprovedLoanDetails/:id", getApprovedLoanDetails);

module.exports = router;