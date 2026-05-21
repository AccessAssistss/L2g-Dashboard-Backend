const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");
const { crifReport } = require("../../utils/proxyUtils");
const { formatDateTime, formatDateForFile } = require("../../utils/dateFormatter");
const { saveBase64Html } = require("../../utils/saveBase64Html");

const prisma = new PrismaClient();

const STATE_CODE_MAP = {
    "Andhra Pradesh": "AP",
    "Arunachal Pradesh": "AR",
    "Assam": "AS",
    "Bihar": "BR",
    "Chhattisgarh": "CG",
    "Chattisgarh": "CG",
    "Goa": "GA",
    "Gujarat": "GJ",
    "Haryana": "HR",
    "Himachal Pradesh": "HP",
    "Jammu & Kashmir": "JK",
    "Jammu and Kashmir": "JK",
    "Jharkhand": "JH",
    "Karnataka": "KA",
    "Kerala": "KL",
    "Madhya Pradesh": "MP",
    "Maharashtra": "MH",
    "Manipur": "MN",
    "Meghalaya": "ML",
    "Mizoram": "MZ",
    "Nagaland": "NL",
    "Odisha": "OR",
    "Punjab": "PB",
    "Rajasthan": "RJ",
    "Sikkim": "SK",
    "Tamil Nadu": "TN",
    "Tripura": "TR",
    "Telangana": "TS",
    "Uttarakhand": "UK",
    "Uttar Pradesh": "UP",
    "West Bengal": "WB",
    "Andaman & Nicobar": "AN",
    "Andaman and Nicobar": "AN",
    "Chandigarh": "CH",
    "Dadra and Nagar Haveli": "DN",
    "Daman & Diu": "DD",
    "Daman and Diu": "DD",
    "Delhi": "DL",
    "Lakshadweep": "LD",
    "Pondicherry": "PY",
    "Puducherry": "PY",
    "Dadra & Nagar Haveli and Daman & Diu": "DNHDD",
    "Dadra and Nagar Haveli and Daman and Diu": "DNHDD",
    "Ladakh": "LA"
};

const getStateCode = (stateName) => {
    if (!stateName) return null;

    const exactMatch = STATE_CODE_MAP[stateName];
    if (exactMatch) return exactMatch;

    const normalizedState = stateName.trim();
    const stateKey = Object.keys(STATE_CODE_MAP).find(
        key => key.toLowerCase() === normalizedState.toLowerCase()
    );

    return stateKey ? STATE_CODE_MAP[stateKey] : stateName;
};

const formatDobForCrif = (dob) => {
    if (!dob) return null;

    // already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        return dob;
    }

    if (/^\d{2}-\d{2}-\d{4}$/.test(dob)) {
        const [day, month, year] = dob.split("-");
        return `${year}-${month}-${day}`;
    }

    return dob;
};

// ##########----------Fetch Guardian CRIF Report----------##########
const fetchApplicantCrifReport = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { loanApplicationId } = req.params;
    if (!loanApplicationId) return res.respond(400, "Loan Application Id is required.");

    const user = await prisma.customUser.findFirst({
        where: { id: userId },
    });
    if (!user) return res.respond(404, "User not found.");

    const agent = await prisma.agent.findFirst({
        where: { customUserId: userId },
    });
    if (!agent) return res.respond(404, "User not found!");

    const loanApplication = await prisma.loanApplication.findUnique({
        where: { id: loanApplicationId }
    });

    if (!loanApplication) {
        return res.respond(404, "Loan Application not found.");
    }

    const dob = formatDobForCrif(loanApplication.applicantDob);
    const pincode = loanApplication.applicantPincode;
    const stateRaw = loanApplication.applicantState;
    const state = getStateCode(stateRaw);
    const pan_number = loanApplication.applicantPan;

    if (!dob || !pan_number || !state || !pincode) {
        return res.respond(400, "Required fields are missing from KYC or Form data.");
    }

    const applicantData = {
        inquiryDateTime: formatDateTime(),
        applicantId: loanApplication.customerId,
        firstName: loanApplication.applicantFirstName,
        middleName: loanApplication.applicantMiddleName,
        lastName: loanApplication.applicantLastName,
        dob: dob,
        pan_number: loanApplication.applicantPan,
        aadhar_number: loanApplication.applicantAadhar,
        address: loanApplication.applicantAddress,
        city: loanApplication.applicantCity,
        state: state,
        pincode: loanApplication.applicantPincode,
        mobile: loanApplication.applicantPhone,
        inquiryId: loanApplication.id,
        applicationId: loanApplication.id,
        loanAmount: loanApplication.loanAmountRequested,
        ltv: "",
        term: "",
    }

    const crifResponse = await crifReport(applicantData)

    if (!crifResponse.success) {
        return res.respond(crifResponse.statusCode || 500, "Failed to fetch CRIF report", crifResponse.data);
    }

    const reportFile = crifResponse?.data?.data?.["CIR-REPORT-FILE"];
    if (!reportFile) {
        return res.respond(500, "Invalid CRIF response structure");
    }

    const scoreArray =
        reportFile?.["REPORT-DATA"]?.["STANDARD-DATA"]?.["SCORE"] || [];

    const crifScore =
        scoreArray.length > 0 && scoreArray[0].VALUE
            ? Number(scoreArray[0].VALUE)
            : null;

    const accountSummary =
        reportFile?.["REPORT-DATA"]?.["ACCOUNTS-SUMMARY"] || null;

    const printableBase64 = reportFile?.["PRINTABLE-REPORT"]?.["CONTENT"];
    const timestamp = formatDateForFile();
    const crifPdfPath = saveBase64Html(
        printableBase64,
        `crif_${loanApplication.id}_${timestamp}`
    );

    await prisma.loanApplication.update({
        where: { id: loanApplication.id },
        data: {
            crifScore: crifScore,
        },
    });

    await prisma.loanCreditData.upsert({
        where: { applicationId: loanApplication.id },
        update: {
            crifPdf: crifPdfPath,
            crifAccountSummery: accountSummary,
        },
        create: {
            applicationId: loanApplication.id,
            crifPdf: crifPdfPath,
            crifAccountSummery: accountSummary,
        },
    });

    res.respond(200, "Credit Report Fetched Successfully!");
});

// ##########----------Fetch Guardian CRIF Report----------##########
const fetchGuardianCrifReport = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { loanApplicationId } = req.params;
    if (!loanApplicationId) return res.respond(400, "Loan Application Id is required.");

    const user = await prisma.customUser.findFirst({
        where: { id: userId },
    });
    if (!user) return res.respond(404, "User not found.");

    const agent = await prisma.agent.findFirst({
        where: { customUserId:userId },
    });
    if (!agent) return res.respond(404, "User not found!");

    const loanApplication = await prisma.loanApplication.findFirst({
        where: { id: loanApplicationId }
    });

    if (!loanApplication) {
        return res.respond(404, "Loan Application not found.");
    }

    const dob = formatDobForCrif(loanApplication.guardianDob);
    const pincode = loanApplication.guardianPincode;
    const stateRaw = loanApplication.guardianState;
    const state = getStateCode(stateRaw);
    const pan_number = loanApplication.guardianPan;

    if (!dob || !pan_number || !state || !pincode) {
        return res.respond(400, "Required fields are missing from KYC or Form data.");
    }

    const guardianData = {
        inquiryDateTime: formatDateTime(),
        applicantId: loanApplication.customerId,
        firstName: loanApplication.guardianFirstName,
        middleName: loanApplication.guardianMiddleName,
        lastName: loanApplication.guardianLastName,
        dob: dob,
        pan_number: loanApplication.guardianPan,
        aadhar_number: loanApplication.guardianAadhar,
        address: loanApplication.guardianAddress,
        city: loanApplication.guardianCity,
        state: state,
        pincode: loanApplication.guardianPincode,
        mobile: loanApplication.guardianPhone,
        inquiryId: loanApplication.id,
        applicationId: loanApplication.id,
        loanAmount: loanApplication.loanAmountRequested,
        ltv: "",
        term: "",
    }

    const crifResponse = await crifReport(guardianData)

    if (!crifResponse.success) {
        return res.respond(crifResponse.statusCode || 500, "Failed to fetch CRIF report", crifResponse.data);
    }

    const reportFile = crifResponse?.data?.data?.["CIR-REPORT-FILE"];
    if (!reportFile) {
        return res.respond(500, "Invalid CRIF response structure");
    }

    const scoreArray =
        reportFile?.["REPORT-DATA"]?.["STANDARD-DATA"]?.["SCORE"] || [];

    const crifScore =
        scoreArray.length > 0 && scoreArray[0].VALUE
            ? Number(scoreArray[0].VALUE)
            : null;

    const accountSummary =
        reportFile?.["REPORT-DATA"]?.["ACCOUNTS-SUMMARY"] || null;

    const printableBase64 = reportFile?.["PRINTABLE-REPORT"]?.["CONTENT"];
    const timestamp = formatDateForFile();
    const crifPdfPath = saveBase64Html(
        printableBase64,
        `crif_${loanApplication.id}_${timestamp}`
    );

    await prisma.loanApplication.update({
        where: { id: loanApplication.id },
        data: {
            crifScore: crifScore,
        },
    });

    await prisma.loanCreditData.upsert({
        where: { applicationId: loanApplication.id },
        update: {
            crifPdf: crifPdfPath,
            crifAccountSummery: accountSummary,
        },
        create: {
            applicationId: loanApplication.id,
            crifPdf: crifPdfPath,
            crifAccountSummery: accountSummary,
        },
    });

    res.respond(200, "Credit Report Fetched Successfully!");
});

module.exports = {
    fetchApplicantCrifReport,
    fetchGuardianCrifReport,
};