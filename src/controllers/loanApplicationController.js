const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");
const { calculateEMI } = require("../../helper/calculateEMI");

const prisma = new PrismaClient();

// ##########----------Create Loan Application----------##########
const createLoanApplication = asyncHandler(async (req, res) => {
    const userId = req.user;

    const {
        partnerId,
        courseId,
        schemeId,
        applicantName,
        applicantPhone,
        applicantEmail,
        applicantGender,
        guardianName,
        guardianPhone,
        guardianEmail,
        relationship,
        fees,
        monthlyIncome,
    } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    if (!partnerId || !courseId || !schemeId) {
        return res.respond(400, "Partner, Course and Scheme are required");
    }

    if (!applicantGender || !["MALE", "FEMALE", "OTHER"].includes(applicantGender)) {
        return res.respond(400, "Valid applicant gender is required (MALE, FEMALE, OTHER)");
    }

    const partner = await prisma.partner.findUnique({
        where: { id: partnerId }
    });
    if (!partner) {
        return res.respond(404, "Partner not found");
    }

    const course = await prisma.course.findUnique({
        where: { id: courseId }
    });
    if (!course || course.partnerId !== partnerId) {
        return res.respond(404, "Course not found or does not belong to selected partner");
    }

    const scheme = await prisma.loanScheme.findUnique({
        where: { id: schemeId }
    });
    if (!scheme || scheme.partnerId !== partnerId || scheme.courseId !== courseId) {
        return res.respond(404, "Scheme not found or does not belong to selected partner and course");
    }

    const refId = `L2G${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const bankStatementFile = req.files?.bankStatement?.[0];
    const admissionDocFile = req.files?.admissionDoc?.[0];

    const bankStatementUrl = bankStatementFile
        ? `/uploads/other/student/bank_statement/${bankStatementFile.filename}`
        : null;

    const admissionDocUrl = admissionDocFile
        ? `/uploads/other/student/admission_doc/${admissionDocFile.filename}`
        : null;

    const loanApplication = await prisma.loanApplication.create({
        data: {
            refId,
            partnerId,
            courseId,
            schemeId,
            applicantName,
            applicantPhone,
            applicantEmail,
            applicantGender,
            guardianName,
            guardianPhone,
            guardianEmail,
            relationship,
            fees: fees ? parseFloat(fees) : null,
            monthlyIncome: monthlyIncome ? parseInt(monthlyIncome) : 0,
            bankStatement: bankStatementUrl,
            admissionDoc: admissionDocUrl,
        },
        include: {
            partner: true,
            course: true
        }
    });

    res.respond(
        201,
        "Loan application created successfully",
        loanApplication
    );
});

// ##########----------Submit KYC----------##########
const submitKYC = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { loanApplicationId } = req.params;
    const { videoKycLink, isVKYCApproved } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

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

// ##########----------Approve Loan----------##########
const approveLoan = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { id } = req.params;
    const {
        loanAmount,
        interestRate,
        tenure
    } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    if (!loanAmount || !interestRate || !tenure) {
        return res.respond(400, "Loan amount, interest rate, and tenure are required");
    }

    const loanApplication = await prisma.loanApplication.findUnique({
        where: { id },
        include: {
            kyc: true,
            scheme: true
        },
    });

    if (!loanApplication) {
        return res.respond(404, "Loan application not found");
    }

    if (!loanApplication.kyc || !loanApplication.kyc.isVKYCApproved) {
        return res.respond(400, "KYC not completed or not approved");
    }

    const scheme = loanApplication.scheme;
    const emiAmount = calculateEMI(
        parseFloat(loanAmount),
        parseFloat(interestRate),
        parseInt(tenure),
        scheme.interestType,
        scheme.interestPaidBy
    );

    const totalInterest = scheme.interestType === "FLAT" && scheme.interestPaidBy === "STUDENT"
        ? (parseFloat(loanAmount) * parseFloat(interestRate) * parseInt(tenure)) / (12 * 100)
        : 0;

    const totalAmount = scheme.interestPaidBy === "PARTNER"
        ? parseFloat(loanAmount)
        : parseFloat(loanAmount) + totalInterest;

    const updatedLoan = await prisma.loanApplication.update({
        where: { id },
        data: {
            status: "APPROVED",
            loanAmount: parseFloat(loanAmount),
            interestRate: parseFloat(interestRate),
            tenure: parseInt(tenure),
            emiAmount: parseFloat(emiAmount.toFixed(2))
        },
        include: {
            scheme: true,
            partner: true,
            course: true
        }
    });

    res.respond(200, "Loan approved successfully with terms", {
        ...updatedLoan,
        calculatedEMI: emiAmount.toFixed(2),
        totalInterest: totalInterest.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        interestType: scheme.interestType,
        interestPaidBy: scheme.interestPaidBy
    });
});

// ##########----------Get All Loans----------##########
const getAllLoans = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { page = 1, limit = 10, search = "" } = req.query;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const skip = (page - 1) * limit;

    const searchFilter = search
        ? {
            OR: [
                { applicantName: { contains: search, mode: "insensitive" } },
                { applicantPhone: { contains: search } },
                { applicantEmail: { contains: search, mode: "insensitive" } },
                { guardianName: { contains: search, mode: "insensitive" } },
                { guardianPhone: { contains: search } },
                { refId: { contains: search, mode: "insensitive" } },
            ],
        }
        : {};

    const total = await prisma.loanApplication.count({ where: searchFilter });

    const loans = await prisma.loanApplication.findMany({
        where: searchFilter,
        skip: Number(skip),
        take: Number(limit),
        select: {
            id: true,
            refId: true,
            applicantName: true,
            applicantPhone: true,
            applicantEmail: true,
            applicantGender: true,
            guardianName: true,
            guardianEmail: true,
            loanAmount: true,
            interestRate: true,
            tenure: true,
            status: true,
            partner: {
                select: {
                    id: true,
                    name: true
                }
            },
            course: {
                select: {
                    id: true,
                    name: true
                }
            },
            scheme: {
                select: {
                    id: true,
                    schemeName: true
                }
            },
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

    res.respond(200, "Loans fetched successfully", {
        total,
        page: Number(page),
        limit: Number(limit),
        data: loans
    });
});

// ##########----------Get Pending Loans----------##########
const getPendingLoans = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { page = 1, limit = 10, search = "" } = req.query;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const skip = (page - 1) * limit;

    const searchFilter = search
        ? {
            OR: [
                { applicantName: { contains: search, mode: "insensitive" } },
                { applicantPhone: { contains: search } },
                { applicantEmail: { contains: search, mode: "insensitive" } },
                { guardianName: { contains: search, mode: "insensitive" } },
                { guardianPhone: { contains: search } },
                { refId: { contains: search, mode: "insensitive" } },
            ],
        }
        : {};

    const total = await prisma.loanApplication.count({
        where: {
            status: "PENDING",
            ...searchFilter
        }
    });

    const pendingLoans = await prisma.loanApplication.findMany({
        where: {
            status: "PENDING",
            ...searchFilter
        },
        skip: Number(skip),
        take: Number(limit),
        select: {
            id: true,
            refId: true,
            applicantName: true,
            applicantPhone: true,
            applicantEmail: true,
            applicantGender: true,
            loanAmount: true,
            interestRate: true,
            tenure: true,
            partner: {
                select: {
                    id: true,
                    name: true
                }
            },
            course: {
                select: {
                    id: true,
                    name: true
                }
            },
            scheme: {
                select: {
                    id: true,
                    schemeName: true
                }
            },
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

    res.respond(200, "Pending loans fetched successfully", {
        total,
        page: Number(page),
        limit: Number(limit),
        data: pendingLoans
    });
});

// ##########----------Get Pending Loan Details----------##########
const getPendingLoanDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const loanDetails = await prisma.loanApplication.findFirst({
        where: {
            id,
            status: "PENDING",
        },
        include: {
            kyc: true,
            partner: true,
            course: true,
            scheme: true
        },
    });

    if (!loanDetails) {
        return res.respond(404, "Loan application not found");
    }

    res.respond(200, "Loan details fetched successfully", loanDetails);
});

// ##########----------Get Approved Loans----------##########
const getApprovedLoans = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { page = 1, limit = 10, search = "" } = req.query;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const skip = (page - 1) * limit;

    const statusArray = ["APPROVED", "ENACH_PENDING", "ENACH_ACTIVE"];

    const searchFilter = search
        ? {
            OR: [
                { applicantName: { contains: search, mode: "insensitive" } },
                { applicantPhone: { contains: search } },
                { applicantEmail: { contains: search, mode: "insensitive" } },
                { guardianName: { contains: search, mode: "insensitive" } },
                { guardianPhone: { contains: search } },
                { refId: { contains: search, mode: "insensitive" } },
            ],
        }
        : {};

    const total = await prisma.loanApplication.count({
        where: {
            status: { in: statusArray },
            ...searchFilter
        }
    });

    const approvedLoans = await prisma.loanApplication.findMany({
        where: {
            status: { in: statusArray },
            ...searchFilter
        },
        skip: Number(skip),
        take: Number(limit),
        select: {
            id: true,
            refId: true,
            applicantName: true,
            applicantPhone: true,
            applicantEmail: true,
            loanAmount: true,
            interestRate: true,
            tenure: true,
            emiAmount: true,
            status: true,
            partner: {
                select: {
                    name: true
                }
            },
            course: {
                select: {
                    name: true
                }
            },
            scheme: {
                select: {
                    schemeName: true
                }
            }
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    res.respond(200, "Approved loans fetched successfully", {
        total,
        page: Number(page),
        limit: Number(limit),
        data: approvedLoans
    });
});

// ##########----------Get Approved Loan Details----------##########
const getApprovedLoanDetails = asyncHandler(async (req, res) => {
    const userId = req.user;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const { id } = req.params;

    const loanDetails = await prisma.loanApplication.findFirst({
        where: {
            id,
            status: "APPROVED",
        },
        include: {
            kyc: true,
            partner: true,
            course: true,
            scheme: true
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
    getAllLoans,
    getPendingLoans,
    getPendingLoanDetails,
    getApprovedLoans,
    getApprovedLoanDetails,
};