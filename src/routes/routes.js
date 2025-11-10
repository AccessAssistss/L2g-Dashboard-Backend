const express = require("express");

const router = express.Router();

router.use("/auth", require("./authRoute"));
router.use("/loan", require("./loanApplicationRoute"));
router.use("/enach", require("./eNachRoute"));
router.use("/disbursement", require("./disbursementRoute"));
router.use("/repayment", require("./repaymentRoute"));
router.use("/analytics", require("./analyticsRoute"));

module.exports = router;
