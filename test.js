const crypto = require('crypto');

// Test webhook signature generation
const testWebhook = () => {
    // Your webhook secret from .env
    const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'your_webhook_secret_here';
    
    // Test payload
    const payload = {
        "event": "token.confirmed",
        "payload": {
            "token": {
                "entity": {
                    "id": "token_MbK8RHzXxbwTLq",
                    "order_id": "order_MbK7HwNkpBQjTd",
                    "customer_id": "cust_MbK6EqWaCFQE4J",
                    "method": "emandate",
                    "bank_account": {
                        "account_number": "1234567890",
                        "ifsc": "HDFC0001234",
                        "account_type": "savings",
                        "beneficiary_name": "John Doe"
                    },
                    "status": "confirmed",
                    "created_at": 1234567890
                }
            }
        }
    };
    
    const body = JSON.stringify(payload);
    
    // Generate signature
    const signature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(body)
        .digest('hex');
    
    console.log('=== WEBHOOK TEST DATA ===\n');
    console.log('Webhook Secret:', WEBHOOK_SECRET);
    console.log('\nPayload:\n', body);
    console.log('\nGenerated Signature:', signature);
    console.log('\n=== CURL COMMAND ===\n');
    console.log(`curl -X POST https://backend.l2gfincap.in/api/v1/webhook/razorpay \\
  -H "Content-Type: application/json" \\
  -H "x-razorpay-signature: ${signature}" \\
  -d '${body}'`);
    console.log('\n====================\n');
};

// Run test
testWebhook();

// Also export for use in other files
module.exports = { testWebhook };