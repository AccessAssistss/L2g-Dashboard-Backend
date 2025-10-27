const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");

const prisma = new PrismaClient();

const createLoanApplication = asyncHandler(async (req, res) => {
    const {
        applicantName,
        applicantPhone,
        applicantEmail,
        course,
        guardianName,
        guardianPhone,
        guardianEmail,
        relationship,
        fees
    } = req.body;

    const refId = `L2G${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const loanApplication = await prisma.loanApplication.create({
        data: {
            refId,
            applicantName,
            applicantPhone,
            applicantEmail,
            course,
            guardianName,
            guardianPhone,
            guardianEmail,
            relationship,
            fees
        },
    });

    res.respond(
        201,
        "Loan application created successfully",
        loanApplication
    );
});

const submitKYC = asyncHandler(async (req, res) => {
    const { loanApplicationId } = req.params;
    const { videoKycLink, isVKYCApproved } = req.body;

    const isVKYCApprovedBool = isVKYCApproved === "true" || isVKYCApproved === true;

    const studentAadharFrontFile = req.files?.studentAadharFront?.[0];
    const studentAadharBackFile = req.files?.studentAadharBack?.[0];
    const studentPanCardFile = req.files?.studentPanCard?.[0];
    const guardianAadharFrontFile = req.files?.guardianAadharFront?.[0];
    const guardianAadharBackFile = req.files?.guardianAadharBack?.[0];
    const guardianPanCardFile = req.files?.guardianPanCard?.[0];

    const studentAadharFrontUrl = studentAadharFrontFile
        ? `/uploads/kyc/student/aadhar_front/${studentAadharFrontFile.filename}`
        : null;

    const studentAadharBackUrl = studentAadharBackFile
        ? `/uploads/kyc/student/aadhar_back/${studentAadharBackFile.filename}`
        : null;

    const studentPanCardUrl = studentPanCardFile
        ? `/uploads/kyc/student/pan/${studentPanCardFile.filename}`
        : null;

    const guardianAadharFrontUrl = guardianAadharFrontFile
        ? `/uploads/kyc/guardian/aadhar_front/${guardianAadharFrontFile.filename}`
        : null;

    const guardianAadharBackUrl = guardianAadharBackFile
        ? `/uploads/kyc/guardian/aadhar_back/${guardianAadharBackFile.filename}`
        : null;

    const guardianPanCardUrl = guardianPanCardFile
        ? `/uploads/kyc/guardian/pan/${guardianPanCardFile.filename}`
        : null;


    const loanApplication = await prisma.loanApplication.findUnique({
        where: { id: loanApplicationId },
    });

    if (!loanApplication) {
        return res.respond(404, "Loan application not found");
    }

    const kyc = await prisma.kYC.upsert({
        where: { loanApplicationId },
        update: {
            studentAadharFront: studentAadharFrontUrl,
            studentAadharBack: studentAadharBackUrl,
            studentPanCard: studentPanCardUrl,
            guardianAadharFront: guardianAadharFrontUrl,
            guardianAadharBack: guardianAadharBackUrl,
            guardianPanCard: guardianPanCardUrl,
            videoKycLink,
            isVKYCApproved: isVKYCApprovedBool,
            approvedAt: isVKYCApprovedBool ? new Date() : null,
        },
        create: {
            loanApplicationId,
            studentAadharFront: studentAadharFrontUrl,
            studentAadharBack: studentAadharBackUrl,
            studentPanCard: studentPanCardUrl,
            guardianAadharFront: guardianAadharFrontUrl,
            guardianAadharBack: guardianAadharBackUrl,
            guardianPanCard: guardianPanCardUrl,
            videoKycLink,
            isVKYCApproved: isVKYCApprovedBool,
            approvedAt: isVKYCApprovedBool ? new Date() : null,
        },
    });

    res.respond(200, "KYC documents submitted successfully", kyc);
});

const approveLoan = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        loanAmount,
        interestRate,
        tenure
    } = req.body;

    if (!loanAmount || !interestRate || !tenure) {
        return res.respond(400, "Loan amount, interest rate, and tenure are required");
    }

    const loanApplication = await prisma.loanApplication.findUnique({
        where: { id },
        include: { kyc: true },
    });

    if (!loanApplication) {
        return res.respond(404, "Loan application not found");
    }

    if (!loanApplication.kyc || !loanApplication.kyc.isVKYCApproved) {
        return res.respond(400, "KYC not completed or not approved");
    }

    const totalInterest = (loanAmount * interestRate * tenure) / (12 * 100);
    const totalAmount = loanAmount + totalInterest;
    const emiAmount = totalAmount / tenure;

    const updatedLoan = await prisma.loanApplication.update({
        where: { id },
        data: {
            status: "APPROVED",
            loanAmount: parseFloat(loanAmount),
            interestRate: parseFloat(interestRate),
            tenure: parseInt(tenure),
            emiAmount: parseFloat(emiAmount.toFixed(2))
        },
    });

    res.respond(200, "Loan approved successfully with terms", {
        ...updatedLoan,
        calculatedEMI: emiAmount.toFixed(2),
        totalInterest: totalInterest.toFixed(2),
        totalAmount: totalAmount.toFixed(2)
    });
});

const getPendingLoans = asyncHandler(async (req, res) => {
    const pendingLoans = await prisma.loanApplication.findMany({
        where: {
            status: "PENDING",
        },
        select: {
            id: true,
            refId: true,
            applicantName: true,
            applicantPhone: true,
            applicantEmail: true,
            course: true,
            loanAmount: true,
            interestRate: true,
            tenure: true,
            kyc: {
                select: {
                    id: true,
                    isVKYCApproved: true,
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    res.respond(200, "Pending loans fetched successfully", pendingLoans);
});

const getPendingLoanDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const loanDetails = await prisma.loanApplication.findFirst({
        where: {
            id,
            status: "PENDING",
        },
        include: {
            kyc: true,
        },
    });

    if (!loanDetails) {
        return res.respond(404, "Loan application not found");
    }

    res.respond(200, "Loan details fetched successfully", loanDetails);
});

const getApprovedLoans = asyncHandler(async (req, res) => {
    const approvedLoans = await prisma.loanApplication.findMany({
        where: {
            status: "APPROVED",
        },
        select: {
            id: true,
            refId: true,
            applicantName: true,
            applicantPhone: true,
            applicantEmail: true,
            course: true,
            loanAmount: true,
            interestRate: true,
            tenure: true,
            emiAmount: true,
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    res.respond(200, "Approved loans fetched successfully", approvedLoans);
});

const getApprovedLoanDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const loanDetails = await prisma.loanApplication.findFirst({
        where: {
            id,
            status: "APPROVED",
        },
        include: {
            kyc: true,
        },
    });

    if (!loanDetails) {
        return res.respond(404, "Loan application not found");
    }

    res.respond(200, "Loan details fetched successfully", loanDetails);
});

module.exports = {
    createLoanApplication,
    submitKYC,
    approveLoan,
    getPendingLoans,
    getPendingLoanDetails,
    getApprovedLoans,
    getApprovedLoanDetails,
};