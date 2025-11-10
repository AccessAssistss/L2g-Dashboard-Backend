const KYC_FILE_FIELDS = {
  studentAadharFront: "student/aadhar_front",
  studentAadharBack: "student/aadhar_back",
  studentPanCard: "student/pan",
  guardianAadharFront: "guardian/aadhar_front",
  guardianAadharBack: "guardian/aadhar_back",
  guardianPanCard: "guardian/pan",
};

const PAYMENT_RECIEPT = {
  paymentReciept: "payment/reciept",
};

const OTHER_DOCS = {
  bankStatement: "student/bank_statement",
  admissionDoc: "student/admission_doc",
};

module.exports = {
  KYC_FILE_FIELDS,
  PAYMENT_RECIEPT,
  OTHER_DOCS
};