const { sendMail } = require("./emailService");

// ###############---------------Send e-NACH Activation Email---------------###############
const sendENachActivationEmail = async ({
  email,
  name,
  loanRefId,
  emiAmount,
  tenure,
  authLink,
}) => {
  const subject = `e-NACH Activation for Loan Ref ${loanRefId} - Loan2Grow Fincap`;

  const emailBody = `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <p>Hello <b>${name}</b>,</p>

      <p>We are pleased to inform you that as per your request, your loan has been approved with the following details:</p>

      <table style="border-collapse: collapse; width: 100%; margin-top: 10px;">
        <tr><td style="padding: 6px 0;"><b>Loan Reference Number</b></td><td>${loanRefId}</td></tr>
        <tr><td style="padding: 6px 0;"><b>Sanctioned Loan Amount</b></td><td>Rs. ${emiAmount * tenure}</td></tr>
        <tr><td style="padding: 6px 0;"><b>EMI Amount</b></td><td>Rs. ${emiAmount}</td></tr>
        <tr><td style="padding: 6px 0;"><b>Loan Tenure</b></td><td>${tenure} months</td></tr>
      </table>

      <p style="margin-top: 20px;">Please complete the following steps to complete the process:</p>
      <ol>
        <li>Activate your e-NACH here:
          <a href="${authLink}" target="_blank" style="color: #007bff;">${authLink}</a>
        </li>
        <li>You will shortly receive an e-sign link from <b>Leegality</b> to digitally sign your loan agreement.</li>
      </ol>

      <p>We value your relationship with us and thank you for choosing <b>Loan2Grow Fincap Private Limited</b>.</p>

      <p>For any queries, feel free to reach out at 
        <a href="mailto:fincaplgrow@gmail.com">fincaplgrow@gmail.com</a>.
      </p>

      <p>Assuring you of our best services always!<br><br>
      <b>Loan2Grow Fincap Private Limited</b></p>
    </div>
  `;

  try {
    await sendMail(email, emailBody, subject);
    console.log("e-NACH Activation Email sent to:", email);
    return true;
  } catch (err) {
    console.error("Email Error:", err.message);
    return false;
  }
};

// ###############---------------Send e-NACH Activation Success Email---------------###############
const sendENachActivationSuccessEmail = async ({
  email,
  name,
  loanRefId,
  emiAmount,
  tenure,
  firstEmiDate,
}) => {
  const subject = `e-NACH Mandate Activated Successfully - Loan Ref ${loanRefId}`;

  const emailBody = `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <p>Dear <b>${name}</b>,</p>

      <p>We are pleased to inform you that your <b>e-NACH mandate</b> has been successfully activated for your loan with the following details:</p>

      <table style="border-collapse: collapse; width: 100%; margin-top: 10px;">
        <tr><td style="padding: 6px 0;"><b>Loan Reference Number</b></td><td>${loanRefId}</td></tr>
        <tr><td style="padding: 6px 0;"><b>Sanctioned Loan Amount</b></td><td>Rs. ${emiAmount * tenure}</td></tr>
        <tr><td style="padding: 6px 0;"><b>EMI Amount</b></td><td>Rs. ${emiAmount}</td></tr>
        <tr><td style="padding: 6px 0;"><b>Loan Tenure</b></td><td>${tenure} months</td></tr>
        <tr><td style="padding: 6px 0;"><b>First EMI Date</b></td><td>${firstEmiDate}</td></tr>
      </table>

      <p style="margin-top: 20px;">
        Your repayments will now be automatically deducted from your registered bank account on the scheduled EMI dates.
      </p>

      <p>
        You will soon receive an email regarding your loan disbursement schedule and repayment summary.
      </p>

      <p>For any queries, please contact us at 
        <a href="mailto:fincaplgrow@gmail.com">fincaplgrow@gmail.com</a>.
      </p>

      <p>Thank you for choosing <b>Loan2Grow Fincap Private Limited</b>.<br><br>
      Regards,<br>
      <b>Loan2Grow Fincap Private Limited</b></p>
    </div>
  `;

  try {
    await sendMail(email, emailBody, subject);
    console.log("e-NACH Activation Success Email sent to:", email);
    return true;
  } catch (err) {
    console.error("Email Error:", err.message);
    return false;
  }
};

module.exports = {
  sendENachActivationEmail,
  sendENachActivationSuccessEmail
};
