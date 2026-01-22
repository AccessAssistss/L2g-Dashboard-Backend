const sendToUniqueNumbers = async (phones = [], sendFn) => {
  const uniquePhones = [...new Set(
    phones
      .map(p => (p || "").trim())
      .filter(p => p.length === 10)
  )];

  for (const phone of uniquePhones) {
    await sendFn(phone);
  }
};

const TEST_ENABLED = process.env.SMS_TEST_ENABLED === "true";
const TEST_NUMBERS = (process.env.SMS_TEST_NUMBERS || "")
  .split(",")
  .map(n => n.trim())
  .filter(Boolean);

const sendTestCopies = async (sendFn) => {
  if (!TEST_ENABLED || TEST_NUMBERS.length === 0) return;

  for (const phone of TEST_NUMBERS) {
    await sendFn(phone);
  }
};

module.exports = { sendToUniqueNumbers, sendTestCopies };
