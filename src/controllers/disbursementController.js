const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");

const prisma = new PrismaClient();

// ##########----------Disburse Loan----------##########
const disburseLoan = asyncHandler(async (req, res) => {
    const userId = req.user;

    const { loanApplicationId } = req.params;
    const {
        advanceEMIPaid = false,
        advanceEMIAmount = 0,
        interestPaidBy
    } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const loanApplication = await prisma.loanApplication.findUnique({
        where: { id: loanApplicationId },
        include: {
            eNachMandate: true
        }
    });

    if (!loanApplication) {
        return res.respond(404, "Loan application not found");
    }

    // if (loanApplication.status !== "ENACH_ACTIVE") {
    //     return res.respond(400, "e-NACH must be activated before disbursement. Current status: " + loanApplication.status);
    // }

    // if (!loanApplication.eNachMandate) {
    //     return res.respond(400, "e-NACH mandate not found");
    // }

    // if (loanApplication.eNachMandate.status !== "ACTIVE") {
    //     return res.respond(400, "e-NACH mandate is not active. Status: " + loanApplication.eNachMandate.status);
    // }

    const existingDisbursement = await prisma.disbursement.findUnique({
        where: { loanApplicationId }
    });

    if (existingDisbursement) {
        return res.respond(400, "Loan already disbursed");
    }

    const loanAmount = loanApplication.loanAmount;
    const interestRate = loanApplication.interestRate;
    const tenure = loanApplication.tenure;

    const result = await prisma.$transaction(async (tx) => {
        const disbursement = await tx.disbursement.create({
            data: {
                loanApplicationId,
                disbursedAmount: loanAmount,
                interestRate,
                tenure,
                advanceEMIPaid,
                advanceEMIAmount: advanceEMIPaid ? advanceEMIAmount : 0,
                interestPaidBy,
            },
        });

        const totalInterest = (loanAmount * interestRate * tenure) / (12 * 100);
        const advanceAmount = advanceEMIPaid ? (advanceEMIAmount || 0) : 0;
        const totalOutstanding = loanAmount + totalInterest - advanceAmount;

        const advanceInterestPortion = advanceAmount * (totalInterest / (loanAmount + totalInterest));
        const advancePrincipalPortion = advanceAmount - advanceInterestPortion;

        const remainingPrincipal = loanAmount - advancePrincipalPortion;
        const remainingInterest = totalInterest - advanceInterestPortion;

        const loanAccountNo = `LA${Date.now()}`;

        const loanAccount = await tx.loanAccount.create({
            data: {
                loanApplicationId,
                loanAccountNo,
                principalAmount: Math.max(0, remainingPrincipal),
                interestAmount: Math.max(0, remainingInterest),
                totalOutstanding: Math.max(0, totalOutstanding),
                totalPaid: advanceAmount,
            },
        });

        await tx.loanApplication.update({
            where: { id: loanApplicationId },
            data: { status: "DISBURSED" },
        });

        const mandate = loanApplication.eNachMandate;
        const emiAmount = loanApplication.emiAmount;
        const numberOfEMIs = Math.ceil(totalOutstanding / emiAmount);

        const schedules = [];
        let currentDate = new Date(mandate.startDate);

        for (let i = 1; i <= numberOfEMIs; i++) {
            const isLastEMI = i === numberOfEMIs;
            const amount = isLastEMI ?
                totalOutstanding - (emiAmount * (numberOfEMIs - 1)) :
                emiAmount;

            schedules.push({
                mandateId: mandate.id,
                emiNumber: i,
                emiAmount: amount,
                scheduledDate: new Date(currentDate),
                status: "PENDING"
            });

            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        await tx.eMISchedule.createMany({ data: schedules });

        return { disbursement, loanAccount, emiScheduleCount: schedules.length };
    });

    res.respond(200, "Loan disbursed successfully. EMI schedule created.", result);
});

// ##########----------Get Disbursed Loans----------##########
const getDisbursedLoans = asyncHandler(async (req, res) => {
    const userId = req.user;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const disbursedLoans = await prisma.loanApplication.findMany({
        where: {
            status: "DISBURSED",
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
            loanAccount: {
                select: {
                    id: true,
                    loanAccountNo: true,
                    totalOutstanding: true,
                    totalPaid: true
                },
            },
            eNachMandate: {
                select: {
                    id: true,
                    mandateId: true,
                    status: true,
                    bankAccountNo: true
                }
            }
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    res.respond(200, "Disbursed loans fetched successfully", disbursedLoans);
});

// ##########----------Get Disbursed Loan Details----------##########
const getDisbursedLoanDetails = asyncHandler(async (req, res) => {
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
            status: "DISBURSED",
        },
        include: {
            kyc: true,
            disbursement: true,
            loanAccount: {
                include: {
                    repayments: {
                        orderBy: { paymentDate: "desc" },
                        take: 10
                    }
                }
            },
            eNachMandate: {
                include: {
                    emiSchedules: {
                        orderBy: { emiNumber: "asc" }
                    },
                    autoPayments: {
                        orderBy: { createdAt: "desc" },
                        take: 10
                    }
                }
            }
        },
    });

    if (!loanDetails) {
        return res.respond(404, "Loan application not found");
    }

    res.respond(200, "Loan details fetched successfully", loanDetails);
});

module.exports = {
    disburseLoan,
    getDisbursedLoans,
    getDisbursedLoanDetails,
};