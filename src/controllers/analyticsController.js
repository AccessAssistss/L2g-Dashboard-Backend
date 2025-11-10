const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");

const prisma = new PrismaClient();

// ##########----------Get Loan Summary----------##########
const getLoanSummary = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { period = "all", startDate, endDate } = req.query;
    
    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    let rangeStart, rangeEnd;
    const now = new Date();

    if (startDate && endDate) {
        rangeStart = new Date(startDate);
        rangeStart.setHours(0, 0, 0, 0);
        rangeEnd = new Date(endDate);
        rangeEnd.setHours(23, 59, 59, 999);
    } else {
        switch (period) {
            case "today":
                rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                break;
            case "month":
                rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
                rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                break;
            case "year":
                rangeStart = new Date(now.getFullYear(), 0, 1);
                rangeEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                break;
            default:
                rangeStart = null;
                rangeEnd = null;
        }
    }

    const whereClause =
        rangeStart && rangeEnd
            ? {
                createdAt: {
                    gte: rangeStart,
                    lte: rangeEnd,
                },
            }
            : {};

    const statusCounts = await prisma.loanApplication.groupBy({
        by: ["status"],
        where: whereClause,
        _count: { status: true },
    });

    const loanAmounts = await prisma.loanApplication.aggregate({
        where: { ...whereClause, loanAmount: { not: null } },
        _sum: { loanAmount: true },
        _avg: { loanAmount: true },
    });

    const disbursedAmounts = await prisma.disbursement.aggregate({
        where:
            rangeStart && rangeEnd
                ? { disbursedAt: { gte: rangeStart, lte: rangeEnd } }
                : {},
        _sum: { disbursedAmount: true },
        _count: { id: true },
    });

    const repaymentStats = await prisma.repayment.aggregate({
        where:
            rangeStart && rangeEnd
                ? { paymentDate: { gte: rangeStart, lte: rangeEnd } }
                : {},
        _sum: { amountPaid: true },
        _count: { id: true },
    });

    const activeENachCount = await prisma.eNachMandate.count({
        where: { status: "ACTIVE" },
    });

    const formattedStatusCounts = {
        pending: 0,
        approved: 0,
        enachPending: 0,
        enachActive: 0,
        disbursed: 0,
        closed: 0,
        total: 0,
    };

    statusCounts.forEach((item) => {
        const count = item._count.status;
        formattedStatusCounts.total += count;

        switch (item.status) {
            case "PENDING":
                formattedStatusCounts.pending = count;
                break;
            case "APPROVED":
                formattedStatusCounts.approved = count;
                break;
            case "ENACH_PENDING":
                formattedStatusCounts.enachPending = count;
                break;
            case "ENACH_ACTIVE":
                formattedStatusCounts.enachActive = count;
                break;
            case "DISBURSED":
                formattedStatusCounts.disbursed = count;
                break;
            case "CLOSED":
                formattedStatusCounts.closed = count;
                break;
        }
    });

    const summary = {
        period,
        dateRange:
            rangeStart && rangeEnd
                ? { start: rangeStart.toISOString(), end: rangeEnd.toISOString() }
                : null,
        loanCounts: formattedStatusCounts,
        financials: {
            totalLoanAmount: loanAmounts._sum.loanAmount || 0,
            averageLoanAmount: loanAmounts._avg.loanAmount || 0,
            totalDisbursed: disbursedAmounts._sum.disbursedAmount || 0,
            disbursedCount: disbursedAmounts._count.id || 0,
            totalRepayments: repaymentStats._sum.amountPaid || 0,
            repaymentCount: repaymentStats._count.id || 0,
        },
        enach: { activeMandate: activeENachCount },
    };

    res.respond(200, "Loan summary analytics fetched successfully", summary);
});

module.exports = {
    getLoanSummary,
};