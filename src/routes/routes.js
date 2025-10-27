const express = require("express");

const router = express.Router();

router.use("/loan", require("./loanApplicationRoute"));
router.use("/enach", require("./eNachRoute"));
router.use("/disbursement", require("./disbursementRoute"));
router.use("/repayment", require("./repaymentRoute"));

module.exports = router;
