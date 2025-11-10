const axios = require("axios");
const { default: axiosRetry } = require("axios-retry");

// ###############---------------Retry failed requests up to 3 times using exponential backoff---------------###############
axiosRetry(axios, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) =>
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        [408, 429, 500, 502, 503, 504].includes(error?.response?.status),
});

// ###############---------------Send OTP via SMS---------------###############
const sendOnboardingMessage = async (mobile) => {
    const url = "https://enterprise.smsgupshup.com/GatewayAPI/rest";

    const link = "www.l2gfincap.in/loan/apply"
    const org = "VGU Jaipur"

    const params = {
        method: "SendMessage",
        send_to: mobile,
        msg: `Congrats on your admission to ${org}! Complete your admission process and avail Zero EMI financing Apply now: ${link} - Loan2grow Fincap`,
        msg_type: "TEXT",
        userid: process.env.SMS_GATEWAY_USERID,
        auth_scheme: "plain",
        password: process.env.SMS_GATEWAY_PASSWORD,
        v: "1.1",
        format: "text",
    };

    try {
        const response = await axios.post(url, null, { params, timeout: 15000 });
        console.log("SMS Response:", response.data);
        return true;
    } catch (error) {
        console.log(error)
        return false;
    }
};

// ###############---------------Send EMI Bounce SMS---------------###############
const sendEmiBounceMessage = async (mobile, name, emiAmount, loanAccountNo) => {
    const url = "https://enterprise.smsgupshup.com/GatewayAPI/rest";

    const params = {
        method: "SendMessage",
        send_to: mobile,
        msg: `Dear ${name}, Your EMI of Rs.${emiAmount} for Loan A/c ${loanAccountNo} has bounced. Please make the payment immediately to avoid penalties and impact on your credit score - L2G Fincap`,
        msg_type: "TEXT",
        userid: "2000254594",
        auth_scheme: "plain",
        password: "Gurgaon@2025",
        v: "1.1",
        format: "text",
    };

    try {
        const response = await axios.post(url, null, { params, timeout: 15000 });
        console.log("SMS Response:", response.data);
        return true;
    } catch (error) {
        console.error("SMS Error:", error.message);
        return false;
    }
};

// ###############---------------Send EMI Reminder SMS---------------###############
const sendEmiReminderMessage = async (mobile, name, emiAmount, loanAccountNo, dueDate) => {
    const url = "https://enterprise.smsgupshup.com/GatewayAPI/rest";

    const params = {
        method: "SendMessage",
        send_to: mobile,
        msg: `Dear ${name}, Your EMI of Rs.${emiAmount} for Loan A/c ${loanAccountNo} with us is due on ${dueDate}. Kindly ensure sufficient funds in your account to avoid penalties - L2G Fincap`,
        msg_type: "TEXT",
        userid: "2000254594",
        auth_scheme: "plain",
        password: "Gurgaon@2025",
        v: "1.1",
        format: "text",
    };

    try {
        const response = await axios.post(url, null, { params, timeout: 15000 });
        console.log("SMS Response:", response.data);
        return true;
    } catch (error) {
        console.error("SMS Error:", error.message);
        return false;
    }
};

module.exports = {
    sendOnboardingMessage,
    sendEmiBounceMessage,
    sendEmiReminderMessage
};