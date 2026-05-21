const express = require("express");
const {
    createLoanApplication,
    getPendingLoans,
    getPendingLoanDetails,
    submitKYC,
    approveLoan,
    getApprovedLoans,
    getApprovedLoanDetails,
    getAllLoans,
    createLoanFromWebsite,
    calculateLoanOffer,
    uploadAgreement,
} = require("../controllers/loanApplicationController");
const multerErrorHandler = require("../../middleware/multerErrorHandler");
const createUploadMiddleware = require("../../middleware/upload");
const { KYC_FILE_FIELDS, OTHER_DOCS, WEBSITE_LOAN_FIELDS, AGREEMENT_FILE } = require("../../utils/fileFieldMapper");
const validateToken = require("../../middleware/validateJwtToken");

const router = express.Router();

const uploadEmployerFiles = createUploadMiddleware("kyc", KYC_FILE_FIELDS);
const uploadOtherFiles = createUploadMiddleware("other", OTHER_DOCS);
const uploadWebsiteLoanFiles = createUploadMiddleware("websiteLoanFields", WEBSITE_LOAN_FIELDS);
const uploadAgreementFiles = createUploadMiddleware("agreement", AGREEMENT_FILE);

router.post("/createLoanApplication", validateToken, uploadOtherFiles, multerErrorHandler, createLoanApplication);
router.post("/submitKYC/:loanApplicationId", validateToken, uploadEmployerFiles, multerErrorHandler, submitKYC);
router.post("/createLoanFromWebsite", uploadWebsiteLoanFiles,  multerErrorHandler, createLoanFromWebsite);
router.post("/calculateLoanOffer/:loanApplicationId", validateToken, uploadEmployerFiles, multerErrorHandler, calculateLoanOffer);
router.post("/approveLoan/:id", validateToken, approveLoan);
router.get("/getAllLoans", validateToken, getAllLoans);
router.get("/getPendingLoans", validateToken, getPendingLoans);
router.get("/getPendingLoanDetails/:id", validateToken, getPendingLoanDetails);
router.get("/getApprovedLoans", validateToken, getApprovedLoans);
router.get("/getApprovedLoanDetails/:id", validateToken, getApprovedLoanDetails);
router.post("/uploadAgreement/:loanApplicationId", validateToken, uploadAgreementFiles, multerErrorHandler, uploadAgreement);

module.exports = router;