const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");

const prisma = new PrismaClient();

// ##########----------Disburse Loan----------##########
const disburseLoan = asyncHandler(async (req, res) => {
    const userId = req.user;

    const { loanApplicationId } = req.params;
    const {
        advanceEMIPaid = true,
        advanceEMIAmount = 0,
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
            eNachMandate: true,
            scheme: true
        }
    });

    if (!loanApplication) {
        return res.respond(404, "Loan application not found");
    }

    const existingDisbursement = await prisma.disbursement.findUnique({
        where: { loanApplicationId }
    });

    if (existingDisbursement) {
        return res.respond(400, "Loan already disbursed");
    }

    const loanAmount = loanApplication.loanAmount;
    const interestRate = loanApplication.interestRate;
    const tenure = loanApplication.tenure;
    const scheme = loanApplication.scheme;

    const result = await prisma.$transaction(async (tx) => {
        const disbursement = await tx.disbursement.create({
            data: {
                loanApplicationId,
                disbursedAmount: loanAmount,
                interestRate,
                tenure,
                advanceEMIPaid,
                advanceEMIAmount: advanceEMIPaid ? advanceEMIAmount : 0,
            },
        });

        let totalInterest = 0;
        let totalOutstanding = 0;
        let remainingPrincipal = loanAmount;
        let remainingInterest = 0;

        if (scheme.interestPaidBy === "PARTNER") {
            // Partner pays interest, student only pays principal
            totalInterest = 0;
            totalOutstanding = loanAmount;
        } else if (scheme.interestType === "FLAT") {
            // Flat interest
            totalInterest = (loanAmount * interestRate * tenure) / (12 * 100);
            totalOutstanding = loanAmount + totalInterest;
        } else {
            totalInterest = 0;
            totalOutstanding = loanAmount;
        }

        const advanceAmount = advanceEMIPaid ? (advanceEMIAmount || 0) : 0;
        
        if (advanceAmount > 0) {
            if (scheme.interestPaidBy === "PARTNER") {
                remainingPrincipal = loanAmount - advanceAmount;
                totalOutstanding = remainingPrincipal;
            } else if (scheme.interestType === "FLAT") {
                const advanceInterestPortion = advanceAmount * (totalInterest / (loanAmount + totalInterest));
                const advancePrincipalPortion = advanceAmount - advanceInterestPortion;
                remainingPrincipal = loanAmount - advancePrincipalPortion;
                remainingInterest = totalInterest - advanceInterestPortion;
                totalOutstanding = remainingPrincipal + remainingInterest;
            } else {
                remainingPrincipal = loanAmount - advanceAmount;
                totalOutstanding = remainingPrincipal;
            }
        } else {
            if (scheme.interestType === "FLAT" && scheme.interestPaidBy === "STUDENT") {
                remainingInterest = totalInterest;
            }
        }

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
        where: { status: "DISBURSED", ...searchFilter }
    });

    const disbursedLoans = await prisma.loanApplication.findMany({
        where: { status: "DISBURSED", ...searchFilter },
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
                    schemeName: true,
                    interestType: true,
                    interestPaidBy: true
                }
            },
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

    const loansWithStatus = disbursedLoans.map(loan => ({
        ...loan,
        disbursementMode: loan.eNachMandate?.status === "ACTIVE" ? "WITH_ENACH" : "MANUAL_REPAYMENT",
        hasENach: loan.eNachMandate?.status === "ACTIVE" || false
    }));

    res.respond(200, "Disbursed loans fetched successfully", {
        total,
        page: Number(page),
        limit: Number(limit),
        data: loansWithStatus
    });
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
            partner: true,
            course: true,
            scheme: true,
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