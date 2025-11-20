const express = require("express");

const router = express.Router();

router.use("/auth", require("./authRoute"));
router.use("/admin", require("./adminRoute"));
router.use("/loan", require("./loanApplicationRoute"));
router.use("/enach", require("./eNachRoute"));
router.use("/disbursement", require("./disbursementRoute"));
router.use("/repayment", require("./repaymentRoute"));
router.use("/analytics", require("./analyticsRoute"));
router.use("/partner", require("./partnerRoute"));
router.use("/course", require("./courseRoute"));
router.use("/loanScheme", require("./loanSchemeRoute"));

module.exports = router;
