const express = require("express");
const { processRepayment, getRepaymentHistory, getClosedLoans, getClosureCertificate, sendBulkEmiReminderMessagesFromExcel, sendBulkEmiBounceMessagesFromExcel, closeLoan } = require("../controllers/repaymentController");
const multerErrorHandler = require("../../middleware/multerErrorHandler");
const createUploadMiddleware = require("../../middleware/upload");
const { PAYMENT_RECIEPT } = require("../../utils/fileFieldMapper")
const multer = require("multer");
const validateToken = require("../../middleware/validateJwtToken");
const upload = multer({ dest: "uploads/" });

const router = express.Router();

const uploadEmployerFiles = createUploadMiddleware("loan", PAYMENT_RECIEPT);

router.post("/processRepayment/:loanApplicationId", validateToken, uploadEmployerFiles, multerErrorHandler, processRepayment);
router.get("/getRepaymentHistory/:loanApplicationId", validateToken, getRepaymentHistory);
router.post("/closeLoan", validateToken, closeLoan);
router.get("/getClosedLoans", validateToken, getClosedLoans);
router.get("/getClosureCertificate/:loanApplicationId", validateToken, getClosureCertificate);
router.post("/sendBulkEmiReminderMessagesFromExcel", upload.single("file"), sendBulkEmiReminderMessagesFromExcel);
router.post("/sendBulkEmiBounceMessagesFromExcel", upload.single("file"), sendBulkEmiBounceMessagesFromExcel);

module.exports = router;