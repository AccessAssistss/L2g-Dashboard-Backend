const express = require("express");
const { addUTRDetails, processRepayment, getRepaymentHistory, getClosedLoans, getClosureCertificate, sendBulkEmiReminderMessagesFromExcel } = require("../controllers/repaymentController");
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
router.get("/getClosedLoans", validateToken, getClosedLoans);
router.get("/getClosureCertificate/:loanApplicationId", validateToken, getClosureCertificate);
router.post("/sendBulkEmiReminderMessagesFromExcel", upload.single("file"), sendBulkEmiReminderMessagesFromExcel);

module.exports = router;