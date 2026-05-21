const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");
const { calculateEMI } = require("../../helper/calculateEMI");
const { sendWelcomeLetterEmail } = require("../../utils/mailSender");

const prisma = new PrismaClient();

const formatDate = (date) => {
    const d = new Date(date);

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();

    return `${day}/${month}/${year}`;
};

// ##########----------Generate Loan Ref ID----------##########
const generateLoanRefId = async (tx) => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, "0");

    const lastLoan = await tx.loanApplication.findFirst({
        orderBy: { createdAt: "desc" },
        select: { refId: true }
    });

    let nextSerial = 1;

    if (lastLoan?.refId) {
        const lastSerial = parseInt(lastLoan.refId.slice(-4));
        if (!isNaN(lastSerial)) {
            nextSerial = lastSerial + 1;
        }
    }

    const serial = String(nextSerial).padStart(4, "0");

    return `VSCTPL${year}${month}${serial}`;
};

module.exports = generateLoanRefId;

// ##########----------Create Loan Application----------##########
const createLoanApplication = asyncHandler(async (req, res) => {
    const userId = req.user;
    const {
        partnerId,
        courseId,
        schemeId,
        applicantFirstName,
        applicantMiddleName,
        applicantLastName,
        applicantDob,
        applicantPhone,
        applicantPan,
        applicantAadhar,
        alternativeApplicantPhone,
        applicantEmail,
        applicantGender,
        applicantAddress,
        applicantState,
        applicantCity,
        applicantPincode,
        guardianFirstName,
        guardianMiddleName,
        guardianLastName,
        guardianDob,
        guardianPan,
        guardianAadhar,
        guardianPhone,
        alternativeGuardianPhone,
        guardianEmail,
        guardianAddress,
        guardianState,
        guardianCity,
        guardianPincode,
        relationship,
        tuitionFees,
        otherCharges,
        monthlyIncome,
        selectedSemesters,
        emiDate = 5
    } = req.body;

    if (emiDate < 1 || emiDate > 28) {
        return res.respond(400, "EMI date must be between 1 and 28");
    }

    try {
        parsedSemesters =
            typeof selectedSemesters === "string"
                ? JSON.parse(selectedSemesters)
                : selectedSemesters;
    } catch (error) {
        return res.respond(400, "Invalid selectedSemesters format");
    }

    if (!Array.isArray(parsedSemesters) || parsedSemesters.length === 0) {
        return res.respond(400, "At least one semester must be selected for funding");
    }

    for (const sem of parsedSemesters) {
        if (!sem.semester || !sem.fees || Number(sem.fees) <= 0) {
            return res.respond(
                400,
                "Each selected semester must contain valid semester and fees"
            );
        }
    }

    if (!applicantGender || !["MALE", "FEMALE", "OTHER"].includes(applicantGender)) {
        return res.respond(400, "Valid applicant gender is required (MALE, FEMALE, OTHER)");
    }

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    if (!partnerId || !courseId || !schemeId) {
        return res.respond(400, "Partner, Course and Scheme are required");
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
        where: { id: schemeId },
        include: {
            partner: true,
            course: true
        }
    });
    if (!scheme || scheme.partnerId !== partnerId) {
        return res.respond(404, "Scheme not found or does not belong to selected partner");
    }

    if (scheme.courseId && scheme.courseId !== courseId) {
        return res.respond(400, "This scheme is only applicable for a different course");
    }

    const loanAmountRequested = parsedSemesters.reduce(
        (sum, sem) => sum + Number(sem.fees),
        0
    );

    const bankStatementFile = req.files?.bankStatement?.[0];
    const admissionDocFile = req.files?.admissionDoc?.[0];

    const bankStatementUrl = bankStatementFile?.path || null;
    const admissionDocUrl = admissionDocFile?.path || null;

    const now = new Date();

    const tuitionFeeAmount = tuitionFees ? Number(tuitionFees) : null;
    const otherFeeAmount = otherCharges ? Number(otherCharges) : null;

    const totalFees =
        tuitionFees !== null && otherFeeAmount !== null
            ? tuitionFeeAmount + otherFeeAmount
            : null;

    const result = await prisma.$transaction(async (tx) => {
        const refId = await generateLoanRefId(tx);

        const loanApplication = await tx.loanApplication.create({
            data: {
                refId,
                partnerId,
                courseId,
                schemeId,
                applicantFirstName,
                applicantMiddleName,
                applicantLastName,
                applicantDob,
                applicantPan,
                applicantAadhar,
                applicantPhone,
                alternativeApplicantPhone,
                applicantEmail,
                applicantGender,
                applicantAddress,
                applicantState,
                applicantCity,
                applicantPincode,
                guardianFirstName,
                guardianMiddleName,
                guardianLastName,
                guardianDob,
                guardianPan,
                guardianAadhar,
                guardianPhone,
                alternativeGuardianPhone,
                guardianEmail,
                guardianAddress,
                guardianState,
                guardianCity,
                guardianPincode,
                relationship,
                tuitionFees: tuitionFeeAmount,
                otherCharges: otherFeeAmount,
                totalFees,
                monthlyIncome: monthlyIncome ? parseInt(monthlyIncome) : 0,
                loanAmountRequested,
                bankStatement: bankStatementUrl,
                admissionDoc: admissionDocUrl,
                emiDate: parseInt(emiDate)
            }
        });

        await tx.loanSemesterFunding.createMany({
            data: parsedSemesters.map((sem) => ({
                loanApplicationId: loanApplication.id,
                semester: sem.semester,
                fees: Number(sem.fees)
            }))
        });


        return loanApplication;
    });

    res.respond(201, "Loan application created successfully", {
        loanApplicationId: result.id,
        loanAmountRequested
    });
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

    const studentAadharFrontUrl = studentAadharFrontFile?.path || null;
    const studentAadharBackUrl = studentAadharBackFile?.path || null;
    const studentPanCardUrl = studentPanCardFile?.path || null;
    const guardianAadharFrontUrl = guardianAadharFrontFile?.path || null;
    const guardianAadharBackUrl = guardianAadharBackFile?.path || null;
    const guardianPanCardUrl = guardianPanCardFile?.path || null;

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

// ##########----------Create Loan Application----------##########
const createLoanFromWebsite = asyncHandler(async (req, res) => {
    const {
        applicantFirstName,
        applicantMiddleName,
        applicantLastName,
        applicantDob,
        applicantPhone,
        applicantPan,
        applicantAadhar,
        alternativeApplicantPhone,
        applicantEmail,
        applicantGender,
        applicantAddress,
        applicantState,
        applicantCity,
        applicantPincode,
        guardianFirstName,
        guardianMiddleName,
        guardianLastName,
        guardianDob,
        guardianPan,
        guardianAadhar,
        guardianPhone,
        alternativeGuardianPhone,
        guardianEmail,
        guardianAddress,
        guardianState,
        guardianCity,
        guardianPincode,
        relationship,
        tuitionFees,
        otherCharges,
        monthlyIncome
    } = req.body;

    if (!applicantGender || !["MALE", "FEMALE", "OTHER"].includes(applicantGender)) {
        return res.respond(400, "Valid applicant gender is required");
    }

    const bankStatementFile = req.files?.bankStatement?.[0];
    const admissionDocFile = req.files?.admissionDoc?.[0];
    const studentAadharFrontFile = req.files?.studentAadharFront?.[0];
    const studentAadharBackFile = req.files?.studentAadharBack?.[0];
    const studentPanCardFile = req.files?.studentPanCard?.[0];
    const guardianAadharFrontFile = req.files?.guardianAadharFront?.[0];
    const guardianAadharBackFile = req.files?.guardianAadharBack?.[0];
    const guardianPanCardFile = req.files?.guardianPanCard?.[0];

    const bankStatementUrl = bankStatementFile?.path || null;
    const admissionDocUrl = admissionDocFile?.path || null;
    const studentAadharFrontUrl = studentAadharFrontFile?.path || null;
    const studentAadharBackUrl = studentAadharBackFile?.path || null;
    const studentPanCardUrl = studentPanCardFile?.path || null;
    const guardianAadharFrontUrl = guardianAadharFrontFile?.path || null;
    const guardianAadharBackUrl = guardianAadharBackFile?.path || null;
    const guardianPanCardUrl = guardianPanCardFile?.path || null;

    const tuitionFeeAmount = tuitionFees ? Number(tuitionFees) : null;
    const otherFeeAmount = otherCharges ? Number(otherCharges) : null;

    const totalFees =
        tuitionFeeAmount !== null && otherFeeAmount !== null
            ? tuitionFeeAmount + otherFeeAmount
            : null;

    const result = await prisma.$transaction(async (tx) => {
        const refId = await generateLoanRefId(tx);

        const loanApplication = await tx.loanApplication.create({
            data: {
                refId,
                applicantFirstName,
                applicantMiddleName,
                applicantLastName,
                applicantDob,
                applicantPhone,
                applicantPan,
                applicantAadhar,
                alternativeApplicantPhone,
                applicantEmail,
                applicantGender,
                applicantAddress,
                applicantState,
                applicantCity,
                applicantPincode,
                guardianFirstName,
                guardianMiddleName,
                guardianLastName,
                guardianDob,
                guardianPan,
                guardianAadhar,
                guardianPhone,
                alternativeGuardianPhone,
                guardianEmail,
                guardianAddress,
                guardianState,
                guardianCity,
                guardianPincode,
                relationship,
                tuitionFees: tuitionFeeAmount,
                otherCharges: otherFeeAmount,
                totalFees,
                monthlyIncome: monthlyIncome
                    ? parseInt(monthlyIncome)
                    : 0,
                bankStatement: bankStatementUrl,
                admissionDoc: admissionDocUrl
            }
        });

        await tx.kYC.create({
            data: {
                loanApplicationId: loanApplication.id,
                studentAadharFront: studentAadharFrontUrl,
                studentAadharBack: studentAadharBackUrl,
                studentPanCard: studentPanCardUrl,
                guardianAadharFront: guardianAadharFrontUrl,
                guardianAadharBack: guardianAadharBackUrl,
                guardianPanCard: guardianPanCardUrl
            }
        });

        return loanApplication;
    });

    res.respond(201, "Loan application created successfully", {
        loanApplicationId: result.id
    });
});

// ##########----------Calculate Loan Offer----------##########
const calculateLoanOffer = asyncHandler(async (req, res) => {
    const { loanApplicationId } = req.params;
    const {
        partnerId,
        courseId,
        schemeId,
        emiDate = 5,
        selectedSemesters
    } = req.body;

    if (!partnerId || !courseId || !schemeId) {
        return res.respond(
            400,
            "Partner, Course and Scheme are required"
        );
    }

    if (emiDate < 1 || emiDate > 28) {
        return res.respond(
            400,
            "EMI date must be between 1 and 28"
        );
    }

    let parsedSemesters;

    try {
        parsedSemesters =
            typeof selectedSemesters === "string"
                ? JSON.parse(selectedSemesters)
                : selectedSemesters;
    } catch (error) {
        return res.respond(400, "Invalid selectedSemesters format");
    }

    if (!Array.isArray(parsedSemesters) || parsedSemesters.length === 0) {
        return res.respond(400, "At least one semester must be selected");
    }

    for (const sem of parsedSemesters) {
        if (!sem.semester || !sem.fees || Number(sem.fees) <= 0) {
            return res.respond(
                400,
                "Each semester must contain valid semester and fees"
            );
        }
    }

    const loanApplication = await prisma.loanApplication.findUnique({
        where: { id: loanApplicationId },
        include: {
            LoanSemesterFunding: true
        }
    });

    if (!loanApplication) {
        return res.respond(404, "Loan application not found");
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
        return res.respond(
            404,
            "Course not found or invalid partner mapping"
        );
    }

    const scheme = await prisma.loanScheme.findUnique({
        where: { id: schemeId }
    });

    if (!scheme || scheme.partnerId !== partnerId) {
        return res.respond(
            404,
            "Scheme not found or invalid partner mapping"
        );
    }

    if (scheme.courseId && scheme.courseId !== courseId) {
        return res.respond(
            400,
            "Scheme does not belong to selected course"
        );
    }

    const emiData = calculateEMI({
        principal: loanAmountRequested,
        annualInterestRate: scheme.interestRate,
        tenureMonths: scheme.tenure
    });

    const loanAmountRequested = parsedSemesters.reduce(
        (sum, sem) => sum + Number(sem.fees),
        0
    );

    const result = await prisma.$transaction(async (tx) => {
        const updatedLoan = await tx.loanApplication.update({
            where: { id: loanApplicationId },
            data: {
                partnerId,
                courseId,
                schemeId,
                loanAmountRequested,
                interestRate: scheme.interestRate,
                tenure: scheme.tenure,
                emiAmount: emiData.emi,
                emiDate: parseInt(emiDate),
            }
        });

        await tx.loanSemesterFunding.createMany({
            data: parsedSemesters.map((sem) => ({
                loanApplicationId: loanApplication.id,
                semester: sem.semester,
                fees: Number(sem.fees)
            }))
        });
    });

    res.respond(200, "Loan offer calculated successfully", {
        loanApplicationId: updatedLoan.id,
        partnerId,
        courseId,
        schemeId,
        loanAmountRequested,
        interestRate: scheme.interestRate,
        tenure: scheme.tenure,
        emiAmount: emiData.emi,
        emiDate
    });
});

// ##########----------Approve Loan----------##########
const approveLoan = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { id } = req.params;
    const {
        loanAmount,
        interestRate,
        tenure,
        emiDate,
        emiStartDate
    } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    if (!loanAmount || !interestRate || !tenure || !emiDate || !emiStartDate) {
        return res.respond(
            400,
            "Loan amount, interest rate, tenure and EMI start date are required"
        );
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

    if (emiDate < 1 || emiDate > 28) {
        return res.respond(400, "EMI date must be between 1 and 28");
    }

    const startDate = new Date(emiStartDate);

    if (isNaN(startDate.getTime())) {
        return res.respond(400, "Invalid EMI start date");
    }

    const firstEmiDate = new Date(startDate);

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + parseInt(tenure));

    const firstEmiPaid = parseFloat(emiAmount.toFixed(2));

    const updateData = {
        status: "APPROVED",
        loanAmount: parseFloat(loanAmount),
        interestRate: parseFloat(interestRate),
        tenure: parseInt(tenure),
        emiAmount: parseFloat(emiAmount.toFixed(2)),
        emiStartDate: firstEmiDate,
        emiEndDate: endDate,
    };

    updateData.emiDate = parseInt(emiDate);

    const updatedLoan = await prisma.loanApplication.update({
        where: { id },
        data: updateData,
        include: {
            scheme: true,
            partner: true,
            course: true
        }
    });

    await sendWelcomeLetterEmail(
        loanApplication.applicantEmail,
        `${loanApplication.applicantFirstName} ${loanApplication.applicantMiddleName || ''} ${loanApplication.applicantLastName || ''}`,
        `${loanApplication.guardianFirstName} ${loanApplication.guardianMiddleName || ''} ${loanApplication.guardianLastName || ''}`,
        loanApplication.applicantPhone,
        loanApplication.guardianPhone,
        loanType = "Education Loan",
        loanApplication.refId,
        loanAmount,
        emiAmount.toFixed(2),
        tenure,
        formatDate(firstEmiDate),
        formatDate(endDate),
        firstEmiPaid
    )

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
                { applicantFirstName: { contains: search, mode: "insensitive" } },
                { applicantMiddleName: { contains: search, mode: "insensitive" } },
                { applicantLastName: { contains: search, mode: "insensitive" } },
                { applicantPhone: { contains: search } },
                { applicantEmail: { contains: search, mode: "insensitive" } },
                { guardianFirstName: { contains: search, mode: "insensitive" } },
                { guardianMiddleName: { contains: search, mode: "insensitive" } },
                { guardianLastName: { contains: search, mode: "insensitive" } },
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
            applicantFirstName: true,
            applicantMiddleName: true,
            applicantLastName: true,
            applicantPhone: true,
            applicantEmail: true,
            applicantGender: true,
            guardianFirstName: true,
            guardianMiddleName: true,
            guardianLastName: true,
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
    const { page = 1, limit = 10, search = "", startDate, endDate } = req.query;

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
                { applicantFirstName: { contains: search, mode: "insensitive" } },
                { applicantMiddleName: { contains: search, mode: "insensitive" } },
                { applicantLastName: { contains: search, mode: "insensitive" } },
                { applicantPhone: { contains: search } },
                { applicantEmail: { contains: search, mode: "insensitive" } },
                { guardianFirstName: { contains: search, mode: "insensitive" } },
                { guardianMiddleName: { contains: search, mode: "insensitive" } },
                { guardianLastName: { contains: search, mode: "insensitive" } },
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

    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
    }

    const createdAtFilter =
        Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const pendingLoans = await prisma.loanApplication.findMany({
        where: {
            status: "PENDING",
            ...searchFilter,
            ...createdAtFilter
        },
        skip: Number(skip),
        take: Number(limit),
        select: {
            id: true,
            refId: true,
            applicantFirstName: true,
            applicantMiddleName: true,
            applicantLastName: true,
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
            scheme: true,
            LoanSemesterFunding: true
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
    const { page = 1, limit = 10, search = "", startDate, endDate } = req.query;

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
                { applicantFirstName: { contains: search, mode: "insensitive" } },
                { applicantMiddleName: { contains: search, mode: "insensitive" } },
                { applicantLastName: { contains: search, mode: "insensitive" } },
                { applicantPhone: { contains: search } },
                { applicantEmail: { contains: search, mode: "insensitive" } },
                { guardianFirstName: { contains: search, mode: "insensitive" } },
                { guardianMiddleName: { contains: search, mode: "insensitive" } },
                { guardianLastName: { contains: search, mode: "insensitive" } },
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

    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
    }

    const createdAtFilter =
        Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const approvedLoans = await prisma.loanApplication.findMany({
        where: {
            status: { in: statusArray },
            ...searchFilter,
            ...createdAtFilter
        },
        skip: Number(skip),
        take: Number(limit),
        select: {
            id: true,
            refId: true,
            applicantFirstName: true,
            applicantMiddleName: true,
            applicantLastName: true,
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
            scheme: true,
            LoanSemesterFunding: true,
            LoanCreditData: true,
            LoanAgreement: true,
        },
    });

    if (!loanDetails) {
        return res.respond(404, "Loan application not found");
    }

    res.respond(200, "Loan details fetched successfully", loanDetails);
});

// ##########----------Upload Agreement----------##########
const uploadAgreement = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { loanApplicationId } = req.params;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const agreementFile = req.files?.agreementFile?.[0];

    const agreementFileUrl = agreementFile?.path || null;

    if (!agreementFileUrl) {
        return res.respond(404, "Agreement File is required!");
    }

    const agreementUploaded = await prisma.LoanAgreement.upsert({
        where: { loanApplicationId: loanApplicationId },
        update: {
            agreementFile: agreementFileUrl,
            isAgreementUploaded: true,
        },
        create: {
            loanApplicationId: loanApplicationId,
            agreementFile: agreementFileUrl,
            isAgreementUploaded: true,
        }
    });

    res.respond(201, "Loan Agreement uploaded successfully");
});

module.exports = {
    createLoanApplication,
    createLoanFromWebsite,
    calculateLoanOffer,
    submitKYC,
    approveLoan,
    getAllLoans,
    getPendingLoans,
    getPendingLoanDetails,
    getApprovedLoans,
    getApprovedLoanDetails,
    uploadAgreement
};