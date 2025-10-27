const express = require("express");
const { handleRazorpayWebhook } = require("../controllers/razorpayWebhookController");

const router = express.Router();

router.post("/razorpay", express.raw({ type: "application/json" }), handleRazorpayWebhook);

module.exports = router;