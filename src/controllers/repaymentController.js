const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");

const prisma = new PrismaClient();

const addUTRDetails = asyncHandler(async (req, res) => {
    const { loanApplicationId } = req.params;
    const { utrId, amountPaid, paymentDate, paymentMode } = req.body;

    const loanAccount = await prisma.loanAccount.findUnique({
        where: { loanApplicationId: loanApplicationId },
    });

    if (!loanAccount) {
        return res.respond(404, "Loan account not found");
    }

    const parsedPaymentDate = new Date(paymentDate);
    if (isNaN(parsedPaymentDate.getTime())) {
        return res.respond(400, "Invalid payment date");
    }

    const paymentRecieptFile = req.files?.paymentReciept?.[0];
    const paymentRecieptUrl = paymentRecieptFile
        ? `/uploads/loan/payment/reciept/${paymentRecieptFile.filename}`
        : null;

    const utrDetail = await prisma.uTRDetail.create({
        data: {
            loanAccountId: loanAccount.id,
            utrId,
            amountPaid,
            paymentDate: parsedPaymentDate,
            paymentMode,
            screenshot: paymentRecieptUrl,
        },
    });

    res.respond(200, "UTR details added successfully", utrDetail);
});

const processRepayment = asyncHandler(async (req, res) => {
    const { loanApplicationId } = req.params;
    const {
        utrId,
        amountPaid,
        paymentDate,
        paymentMode,
    } = req.body;

    const loanAccount = await prisma.loanAccount.findUnique({
        where: { loanApplicationId: loanApplicationId },
    });

    if (!loanAccount) {
        return res.respond(404, "Loan account not found");
    }

    const parsedPaymentDate = new Date(paymentDate);
    if (isNaN(parsedPaymentDate.getTime())) {
        return res.respond(400, "Invalid payment date");
    }

    const amountPaidFloat = parseFloat(amountPaid);
    if (isNaN(amountPaidFloat) || amountPaidFloat <= 0) {
        return res.respond(400, "Payment amount must be a valid number greater than zero");
    }

    const principalAmount = parseFloat(loanAccount.principalAmount);
    const interestAmount = parseFloat(loanAccount.interestAmount);
    const totalOutstanding = parseFloat(loanAccount.totalOutstanding);
    const totalPaid = parseFloat(loanAccount.totalPaid);

    if (amountPaidFloat > totalOutstanding) {
        return res.respond(400, "Payment amount cannot exceed total outstanding");
    }

    const paymentRecieptFile = req.files?.paymentReciept?.[0];
    const paymentRecieptUrl = paymentRecieptFile
        ? `/uploads/loan/payment/reciept/${paymentRecieptFile.filename}`
        : null;

    const totalRemaining = principalAmount + interestAmount;
    const interestPortion = totalRemaining > 0
        ? (amountPaidFloat * interestAmount) / totalRemaining
        : 0;
    const principalPortion = amountPaidFloat - interestPortion;

    const newInterestAmount = Math.max(0, interestAmount - interestPortion);
    const newPrincipalAmount = Math.max(0, principalAmount - principalPortion);
    const newTotalOutstanding = Math.max(0, totalOutstanding - amountPaidFloat);

    const result = await prisma.$transaction(async (tx) => {
        const repayment = await tx.repayment.create({
            data: { 
                loanAccountId: loanAccount.id,
                amountPaid: amountPaidFloat,
                paymentDate: parsedPaymentDate,
                paymentMode,
                utrId,
                screenshot: paymentRecieptUrl,
                principalAmount: principalPortion,
                interestAmount: interestPortion,
                totalOutstanding: newTotalOutstanding,
            },
        });

        const updatedAccount = await tx.loanAccount.update({
            where: { id: loanAccount.id },
            data: {
                principalAmount: newPrincipalAmount,
                interestAmount: newInterestAmount,
                totalOutstanding: newTotalOutstanding,
                totalPaid: totalPaid + amountPaidFloat,
            },
        });

        if (newTotalOutstanding <= 0) {
            await tx.loanApplication.update({
                where: { id: loanAccount.loanApplicationId },
                data: { status: "CLOSED" },
            });

            await tx.closureCertificate.create({
                data: {
                    loanApplicationId: loanAccount.loanApplicationId,
                },
            });
        }

        return { repayment, updatedAccount };
    });

    res.respond(200, "Repayment processed successfully", result);
});

const getRepaymentHistory = asyncHandler(async (req, res) => {
    const { loanApplicationId } = req.params;

    const loanAccount = await prisma.loanAccount.findUnique({
        where: { loanApplicationId: loanApplicationId },
        include: {
            loanApplication: {
                select: {
                    applicantName: true,
                    refId: true,
                },
            },
        },
    });

    if (!loanAccount) {
        return res.respond(404, "Loan account not found");
    }

    const repayments = await prisma.repayment.findMany({
        where: { loanAccountId: loanAccount.id },
        orderBy: { paymentDate: "desc" },
    });

    res.respond(200, "Repayment history fetched successfully", {
        loanAccount,
        repayments,
    });
});

const getClosedLoans = asyncHandler(async (req, res) => {
    const closedLoans = await prisma.loanApplication.findMany({
        where: {
            status: "CLOSED",
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
            loanAccount: {
                select: {
                    id: true,
                    loanAccountNo: true,
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    res.respond(200, "Closed loans fetched successfully", closedLoans);
});

const getClosureCertificate = asyncHandler(async (req, res) => {
    const { loanApplicationId } = req.params;

    const certificate = await prisma.closureCertificate.findUnique({
        where: { loanApplicationId },
    });

    if (!certificate) {
        return res.respond(404, "Closure certificate not found");
    }

    res.respond(200, "Closure certificate fetched successfully", certificate);
});

module.exports = {
    addUTRDetails,
    processRepayment,
    getRepaymentHistory,
    getClosedLoans,
    getClosureCertificate,
};