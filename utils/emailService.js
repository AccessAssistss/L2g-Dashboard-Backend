const formData = require("form-data");
const Mailgun = require("mailgun.js");
const mailgun = new Mailgun(formData);

const mg = mailgun.client({
    username: "api",
    key: process.env.MAILGUN_API_KEY,
    url: "https://api.mailgun.net",
});

const sendMail = async (to, html, subject) => {
    try {
        const messageData = {
            from: `Loan2Grow <${process.env.MAILGUN_FROM_EMAIL}>`,
            to,
            subject,
            html,
        };

        await mg.messages.create(process.env.MAILGUN_DOMAIN, messageData);
        return "Email sent!";
    } catch (error) {
        console.error("Mailgun error:", error);
        throw new Error("Failed to send email via Mailgun");
    }
};

module.exports = {
    sendMail
}