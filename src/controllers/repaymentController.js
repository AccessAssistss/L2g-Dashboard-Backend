const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");
const { sendEmiReminderMessage } = require("../../utils/messageSender");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const moment = require("moment");
const { parseFlexibleDate } = require("../../helper/dateParser");

const prisma = new PrismaClient();

// ##########----------Process Repayment----------##########
const processRepayment = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { loanApplicationId } = req.params;
    const {
        utrId,
        amountPaid,
        paymentDate,
        paymentMode,
    } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const loanAccount = await prisma.loanAccount.findUnique({
        where: { loanApplicationId: loanApplicationId },
        include: {
            loanApplication: {
                include: {
                    scheme: true
                }
            }
        }
    });
    if (!loanAccount) {
        return res.respond(404, "Loan account not found");
    }

    const parsedPaymentDate = parseFlexibleDate(paymentDate);

    if (!parsedPaymentDate) {
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

    const scheme = loanAccount.loanApplication.scheme;
    const loanApp = loanAccount.loanApplication;

    let interestPortion = 0;
    let principalPortion = 0;
    let newInterestAmount = 0;
    let newPrincipalAmount = 0;
    let newTotalOutstanding = 0;


    if (scheme.interestPaidBy === "PARTNER") {
        principalPortion = amountPaidFloat;
        interestPortion = 0;
        newPrincipalAmount = Math.max(0, principalAmount - principalPortion);
        newInterestAmount = 0;
        newTotalOutstanding = newPrincipalAmount;
    } else if (scheme.interestType === "FLAT") {
        const totalRemaining = principalAmount + interestAmount;
        interestPortion = totalRemaining > 0
            ? (amountPaidFloat * interestAmount) / totalRemaining
            : 0;
        principalPortion = amountPaidFloat - interestPortion;

        newInterestAmount = Math.max(0, interestAmount - interestPortion);
        newPrincipalAmount = Math.max(0, principalAmount - principalPortion);
        newTotalOutstanding = newPrincipalAmount + newInterestAmount;
    } else {
        const monthlyRate = (loanApp.interestRate / 12) / 100;
        interestPortion = principalAmount * monthlyRate;

        if (interestPortion > amountPaidFloat) {
            interestPortion = amountPaidFloat;
            principalPortion = 0;
        } else {
            principalPortion = amountPaidFloat - interestPortion;
        }

        newPrincipalAmount = Math.max(0, principalAmount - principalPortion);
        newInterestAmount = 0;
        newTotalOutstanding = newPrincipalAmount;
    }

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

// ##########----------Get Repayment History----------##########
const getRepaymentHistory = asyncHandler(async (req, res) => {
    const { loanApplicationId } = req.params;
    const userId = req.user;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const loanAccount = await prisma.loanAccount.findUnique({
        where: { loanApplicationId: loanApplicationId },
        include: {
            loanApplication: {
                select: {
                    applicantName: true,
                    refId: true,
                    scheme: {
                        select: {
                            interestType: true,
                            interestPaidBy: true
                        }
                    }
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

// ##########----------Get Closed Loans----------##########
const getClosedLoans = asyncHandler(async (req, res) => {
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
        where: { status: "CLOSED", ...searchFilter }
    });

    const closedLoans = await prisma.loanApplication.findMany({
        where: { status: "CLOSED", ...searchFilter },
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

    res.respond(200, "Closed loans fetched successfully", {
        total,
        page: Number(page),
        limit: Number(limit),
        data: closedLoans
    });
});

// ##########----------Get Closure Certificate----------##########
const getClosureCertificate = asyncHandler(async (req, res) => {
    const { loanApplicationId } = req.params;
    const userId = req.user;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const certificate = await prisma.closureCertificate.findUnique({
        where: { loanApplicationId },
    });

    if (!certificate) {
        return res.respond(404, "Closure certificate not found");
    }

    res.respond(200, "Closure certificate fetched successfully", certificate);
});

const sendBulkEmiReminderMessagesFromExcel = asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.respond(400, "No file uploaded!");
    }

    const filePath = req.file.path;

    let workbook;
    try {
        workbook = xlsx.readFile(filePath);
    } catch (err) {
        return res.respond(400, "Failed to parse Excel file.");
    }

    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const results = [];

    for (const row of sheetData) {
        const name = row['Applicant Name'] || row.name || row.Name || "Customer";
        const mobile = String(row['Mobile Number'] || row.mobile || row.phone || row.Phone || '').trim();
        const guardianMobile = String(row['Guardian Mobile'] || row['Guardian Number'] || row.guardian_mobile || row.gmobile || '').trim();
        const emiAmount = row['Emi Amount'] || row.emi || row.EMI_Amount || row.amount;
        const loanAccountNo = row['Loan No'] || row.loan || row.Loan_Account_No || row.account;

        const emiDateRaw = row['Due Date'] || row.Date || row.date || row.dueDate || "N/A";

        let dueDate = "N/A";

        if (emiDateRaw) {
            let parsedDate;

            if (typeof emiDateRaw === "number") {
                parsedDate = moment(new Date((emiDateRaw - 25569) * 86400 * 1000));
            } else if (emiDateRaw instanceof Date) {
                parsedDate = moment(emiDateRaw);
            } else {
                parsedDate = moment(emiDateRaw, ["DD-MM-YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "Do MMM YYYY"], true);
            }

            if (parsedDate.isValid()) {
                dueDate = parsedDate.format("DD-MM-YYYY");
            }
        }

        const cleanEmiAmount = typeof emiAmount === 'string' ? emiAmount.replace(/,/g, '') : emiAmount;

        if (!mobile && !guardianMobile && !email) {
            results.push({ status: "skipped", reason: "Missing mobile, guardian mobile and email", row });
            continue;
        }

        const status = { sms_sent: null, guardian_sms_sent: null };

        if (mobile) {
            try {
                const smsSent = await sendEmiReminderMessage(mobile, name, cleanEmiAmount, loanAccountNo, dueDate);
                status.sms_sent = smsSent ? "sent" : "failed";
            } catch (err) {
                status.sms_sent = `failed: ${err.message}`;
            }
        }

        if (guardianMobile && guardianMobile !== mobile) {
            try {
                const guardianSmsSent = await sendEmiReminderMessage(guardianMobile, name, cleanEmiAmount, loanAccountNo, dueDate);
                status.guardian_sms_sent = guardianSmsSent ? "sent" : "failed";
            } catch (err) {
                status.guardian_sms_sent = `failed: ${err.message}`;
            }
        }

        results.push({
            name,
            mobile,
            guardianMobile,
            emiAmount: cleanEmiAmount,
            loanAccountNo,
            dueDate,
            ...status
        });
    }

    fs.unlink(filePath, () => { });

    res.respond(200, "Bulk EMI reminder messages sent.", results);
});

module.exports = {
    processRepayment,
    getRepaymentHistory,
    getClosedLoans,
    getClosureCertificate,
    sendBulkEmiReminderMessagesFromExcel
};