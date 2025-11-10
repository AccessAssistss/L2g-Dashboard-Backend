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
const { KYC_FILE_FIELDS, OTHER_DOCS } = require("../../utils/fileFieldMapper");
const validateToken = require("../../middleware/validateJwtToken");

const router = express.Router();

const uploadEmployerFiles = createUploadMiddleware("kyc", KYC_FILE_FIELDS);
const uploadOtherFiles = createUploadMiddleware("OTHER", OTHER_DOCS);

router.post("/createLoanApplication", validateToken, uploadOtherFiles, multerErrorHandler, createLoanApplication);
router.post("/submitKYC/:loanApplicationId", validateToken, uploadEmployerFiles, multerErrorHandler, submitKYC);
router.post("/approveLoan/:id", validateToken, approveLoan);
router.get("/getPendingLoans", validateToken, getPendingLoans);
router.get("/getPendingLoanDetails/:id", validateToken, getPendingLoanDetails);
router.get("/getApprovedLoans", validateToken, getApprovedLoans);
router.get("/getApprovedLoanDetails/:id", validateToken, getApprovedLoanDetails);

module.exports = router;