const crypto = require('crypto');

const verifyRazorpayWebhook = (req) => {
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);

    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(body)
        .digest('hex');

    return signature === expectedSignature;
};

module.exports = { verifyRazorpayWebhook };