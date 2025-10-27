const cron = require("node-cron");
const { PrismaClient } = require("@prisma/client");
const razorpayInstance = require("../utils/razorpay");

const prisma = new PrismaClient();

const scheduleEMIPayments = cron.schedule("0 9 * * *", async () => {
    console.log("Running EMI scheduler job...");

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const pendingEMIs = await prisma.eMISchedule.findMany({
            where: {
                scheduledDate: {
                    gte: today,
                    lt: tomorrow
                },
                status: {
                    in: ["PENDING", "FAILED"]
                },
                retryCount: {
                    lt: 3
                }
            },
            include: {
                mandate: {
                    include: {
                        loanApplication: {
                            include: {
                                loanAccount: true
                            }
                        }
                    }
                }
            }
        });

        console.log(`Found ${pendingEMIs.length} EMIs to process`);

        for (const emi of pendingEMIs) {
            const mandate = emi.mandate;

            if (mandate.status !== "ACTIVE" && mandate.status !== "CONFIRMED") {
                console.log(`Skipping EMI ${emi.id} - Mandate not active`);
                continue;
            }

            try {
                const payment = await razorpayInstance.payments.createRecurring({
                    email: mandate.loanApplication.applicantEmail,
                    contact: mandate.loanApplication.applicantPhone,
                    amount: Math.round(emi.emiAmount * 100),
                    currency: "INR",
                    recurring: "1",
                    token: {
                        id: mandate.tokenId
                    },
                    description: `EMI Payment #${emi.emiNumber} for Loan ${mandate.loanApplication.loanAccount?.loanAccountNo}`,
                    notes: {
                        loan_application_id: mandate.loanApplicationId,
                        loan_account_id: mandate.loanApplication.loanAccount?.id,
                        emi_schedule_id: emi.id,
                        emi_number: emi.emiNumber
                    }
                });

                await prisma.autoPayment.create({
                    data: {
                        mandateId: mandate.id,
                        loanApplicationId: mandate.loanApplicationId,
                        loanAccountId: mandate.loanApplication.loanAccount?.id,
                        razorpayPaymentId: payment.id,
                        amount: emi.emiAmount,
                        status: "CREATED"
                    }
                });

                await prisma.eMISchedule.update({
                    where: { id: emi.id },
                    data: {
                        status: "PROCESSING",
                        paymentId: payment.id
                    }
                });

                console.log(`EMI ${emi.id} payment initiated: ${payment.id}`);

            } catch (error) {
                console.error(`Failed to process EMI ${emi.id}:`, error.message);

                await prisma.eMISchedule.update({
                    where: { id: emi.id },
                    data: {
                        retryCount: { increment: 1 },
                        failureReason: error.message
                    }
                });
            }
        }

        console.log("EMI scheduler job completed");

    } catch (error) {
        console.error("EMI scheduler job error:", error);
    }
});

const startEMIScheduler = () => {
    scheduleEMIPayments.start();
    console.log("EMI scheduler started - runs daily at 9:00 AM");
};

const stopEMIScheduler = () => {
    scheduleEMIPayments.stop();
    console.log("EMI scheduler stopped");
};

module.exports = {
    startEMIScheduler,
    stopEMIScheduler
};