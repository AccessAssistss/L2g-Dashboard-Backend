const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");
const razorpayInstance = require("../../utils/razorpay");
const { sendENachActivationEmail } = require("../../utils/mailSender");

const prisma = new PrismaClient();

// ##########----------Activate E-Nach----------##########
const activateENach = asyncHandler(async (req, res) => {
    const userId = req.user;

    const { loanApplicationId } = req.params;
    const { bankAccountNo, ifscCode, accountType = "savings" } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    if (!bankAccountNo || !ifscCode) {
        return res.respond(400, "Bank account number and IFSC code are required");
    }

    const loanApplication = await prisma.loanApplication.findUnique({
        where: { id: loanApplicationId },
        include: { eNachMandate: true }
    });

    if (!loanApplication) {
        return res.respond(404, "Loan application not found");
    }

    if (loanApplication.status !== "APPROVED") {
        return res.respond(400, "Loan must be approved before activating e-NACH");
    }

    if (!loanApplication.loanAmount || !loanApplication.interestRate || !loanApplication.tenure) {
        return res.respond(400, "Loan terms not set. Please approve loan with amount, rate, and tenure first");
    }

    if (loanApplication.eNachMandate) {
        return res.respond(400, "e-NACH already activated for this loan");
    }

    try {
        let customer;
        try {
            customer = await razorpayInstance.customers.create({
                name: loanApplication.applicantName,
                email: loanApplication.applicantEmail,
                contact: loanApplication.applicantPhone,
                fail_existing: 0,
                notes: {
                    loan_ref_id: loanApplication.refId,
                    loan_application_id: loanApplicationId,
                },
            });
        } catch (err) {
            if (err.error?.code === "BAD_REQUEST_ERROR" && err.error.description?.includes("Customer already exists")) {
                const existing = await razorpayInstance.customers.all({ email: loanApplication.applicantEmail });
                if (existing.items.length > 0) customer = existing.items[0];
                else throw new Error("Unable to fetch existing customer from Razorpay");
            } else throw err;
        }

        const maxAmount = loanApplication.emiAmount * 1.1;
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() + 1);
        startDate.setDate(1);

        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + loanApplication.tenure);

        const registrationLink = await razorpayInstance.subscriptions.createRegistrationLink({
            customer: {
                name: loanApplication.applicantName,
                email: loanApplication.applicantEmail,
                contact: loanApplication.applicantPhone,
            },
            type: "link",
            amount: 0,
            currency: "INR",
            description: `e-NACH Registration + First EMI Payment for Loan ${loanApplication.refId}`,
            subscription_registration: {
                first_payment_amount: Math.round(loanApplication.emiAmount * 100),
                method: "emandate",
                auth_type: "netbanking",
                max_amount: Math.round(maxAmount * 100),
                expire_at: Math.floor(endDate.getTime() / 1000),
                bank_account: {
                    beneficiary_name: loanApplication.applicantName,
                    account_number: bankAccountNo,
                    account_type: accountType,
                    ifsc_code: ifscCode,
                },
            },
            receipt: `ENACH_${loanApplication.refId}`,
            email_notify: true,
            sms_notify: true,
            expire_by: Math.floor(endDate.getTime() / 1000),
            notes: {
                loan_ref_id: loanApplication.refId,
                loan_application_id: loanApplicationId,
            },
        });

        const mandate = await prisma.$transaction(async (tx) => {
            const newMandate = await tx.eNachMandate.create({
                data: {
                    loanApplicationId,
                    mandateId: registrationLink.order_id,
                    customerId: customer.id,
                    bankAccountNo,
                    ifscCode,
                    accountType,
                    maxAmount,
                    startDate,
                    endDate,
                    status: "CREATED",
                    authLink: registrationLink.short_url
                }
            });

            await tx.loanApplication.update({
                where: { id: loanApplicationId },
                data: { status: "ENACH_PENDING" }
            });

            return newMandate;
        });

        try {
            await sendENachActivationEmail({
                email: loanApplication.applicantEmail,
                name: loanApplication.applicantName,
                authLink: registrationLink.short_url,
                loanRefId: loanApplication.refId,
                emiAmount: loanApplication.emiAmount,
                tenure: loanApplication.tenure
            });
        } catch (emailError) {
            console.error("Email sending failed:", emailError);
        }

        res.respond(200, "e-NACH activation initiated. Email sent to customer.", {
            mandate,
            authLink: registrationLink.short_url,
            invoiceId: registrationLink.id,
            message: "Customer must complete authentication to activate e-NACH. Razorpay has sent SMS and Email."
        });

    } catch (error) {
        console.error("e-NACH activation error:", error);
        res.respond(500, "Failed to activate e-NACH", {
            error: error.message
        });
    }
});

// ##########----------Check E-Nach Status----------##########
const checkENachStatus = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { loanApplicationId } = req.params;
    
    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const mandate = await prisma.eNachMandate.findUnique({
        where: { loanApplicationId },
        include: {
            loanApplication: {
                select: {
                    refId: true,
                    applicantName: true,
                    loanAmount: true,
                    emiAmount: true,
                    tenure: true,
                    status: true
                }
            }
        }
    });

    if (!mandate) {
        return res.respond(404, "e-NACH not activated for this loan");
    }

    try {
        const token = await razorpayInstance.tokens.fetch(mandate.mandateId);

        if (token.status === "confirmed" && mandate.status !== "ACTIVE") {
            await prisma.$transaction(async (tx) => {
                await tx.eNachMandate.update({
                    where: { id: mandate.id },
                    data: {
                        status: "ACTIVE",
                        tokenId: token.id
                    }
                });

                await tx.loanApplication.update({
                    where: { id: loanApplicationId },
                    data: { status: "ENACH_ACTIVE" }
                });
            });

            mandate.status = "ACTIVE";
        }

        res.respond(200, "e-NACH status fetched successfully", {
            mandate,
            razorpayStatus: token.status,
            canDisburse: token.status === "confirmed"
        });

    } catch (error) {
        res.respond(200, "e-NACH status from database", {
            mandate,
            note: "Could not fetch latest status from Razorpay"
        });
    }
});

// ##########----------Resend E-Nach Link----------##########
const resendENachLink = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { loanApplicationId } = req.params;
    
    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const mandate = await prisma.eNachMandate.findUnique({
        where: { loanApplicationId },
        include: {
            loanApplication: true
        }
    });

    if (!mandate) {
        return res.respond(404, "e-NACH not found");
    }

    if (mandate.status === "ACTIVE") {
        return res.respond(400, "e-NACH already activated");
    }

    await sendENachActivationEmail({
        email: mandate.loanApplication.applicantEmail,
        name: mandate.loanApplication.applicantName,
        authLink: mandate.authLink,
        loanRefId: mandate.loanApplication.refId,
        emiAmount: mandate.loanApplication.emiAmount,
        tenure: mandate.loanApplication.tenure
    });

    res.respond(200, "e-NACH activation link resent successfully");
});

// ##########----------Get Loans For E-nach Activation----------##########
const getLoansForENachActivation = asyncHandler(async (req, res) => {
    const userId = req.user;
    
    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const loans = await prisma.loanApplication.findMany({
        where: {
            status: "APPROVED",
            eNachMandate: null
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
            emiAmount: true
        },
        orderBy: {
            updatedAt: "desc"
        }
    });

    res.respond(200, "Loans ready for e-NACH activation", loans);
});

// ##########----------Get E-nach Pending Loans----------##########
const getPendingENachLoans = asyncHandler(async (req, res) => {
    const userId = req.user;
    
    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const loans = await prisma.loanApplication.findMany({
        where: {
            status: "ENACH_PENDING"
        },
        include: {
            eNachMandate: {
                select: {
                    id: true,
                    mandateId: true,
                    status: true,
                    authLink: true,
                    createdAt: true
                }
            }
        },
        orderBy: {
            updatedAt: "desc"
        }
    });

    res.respond(200, "Loans with pending e-NACH activation", loans);
});

// ##########----------Get E-nach Active Loans----------##########
const getENachActiveLoans = asyncHandler(async (req, res) => {
    const userId = req.user;
    
    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }
    
    const loans = await prisma.loanApplication.findMany({
        where: {
            status: "ENACH_ACTIVE"
        },
        include: {
            eNachMandate: {
                select: {
                    id: true,
                    mandateId: true,
                    status: true,
                    bankAccountNo: true,
                    maxAmount: true
                }
            }
        },
        orderBy: {
            updatedAt: "desc"
        }
    });

    res.respond(200, "Loans ready for disbursement (e-NACH active)", loans);
});

module.exports = {
    activateENach,
    checkENachStatus,
    resendENachLink,
    getLoansForENachActivation,
    getPendingENachLoans,
    getENachActiveLoans
};