const { PrismaClient } = require("@prisma/client");
const { verifyRazorpayWebhook } = require("../../utils/razorpayWebhookVerifier");
const { sendENachActivationSuccessEmail } = require("../../utils/mailSender");

const prisma = new PrismaClient();

const handleRazorpayWebhook = async (req, res) => {
    try {
        const isValid = verifyRazorpayWebhook(req);

        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: "Invalid webhook signature"
            });
        }

        const event = req.body.event;
        const payload = req.body.payload;

        console.log(`Webhook received: ${event}`);

        switch (event) {
            case "token.confirmed":
                await handleTokenConfirmed(payload);
                break;

            case "payment.authorized":
                await handlePaymentAuthorized(payload);
                break;

            case "payment.captured":
                await handlePaymentCaptured(payload);
                break;

            case "payment.failed":
                await handlePaymentFailed(payload);
                break;

            case "token.cancelled":
                await handleTokenCancelled(payload);
                break;

            case "token.paused":
                await handleTokenPaused(payload);
                break;

            case "token.resumed":
                await handleTokenResumed(payload);
                break;

            default:
                console.log(`Unhandled webhook event: ${event}`);
        }

        res.status(200).json({ success: true, message: "Webhook processed" });

    } catch (error) {
        console.error("Webhook error:", error);
        res.status(500).json({
            success: false,
            message: "Webhook processing failed",
            error: error.message
        });
    }
};

const handleTokenConfirmed = async (payload) => {
    const tokenEntity = payload.token.entity;
    const mandateId = tokenEntity.id;

    console.log(`Processing token confirmation for: ${mandateId}`);

    const mandate = await prisma.eNachMandate.findUnique({
        where: { mandateId },
        include: {
            loanApplication: true
        }
    });

    if (!mandate) {
        console.error(`Mandate not found: ${mandateId}`);
        return;
    }

    await prisma.$transaction(async (tx) => {
        await tx.eNachMandate.update({
            where: { mandateId },
            data: {
                status: "ACTIVE",
                tokenId: mandateId
            }
        });

        await tx.loanApplication.update({
            where: { id: mandate.loanApplicationId },
            data: { status: "ENACH_ACTIVE" }
        });
    });

    try {
        const firstEmiDate = new Date(mandate.startDate);

        await sendENachActivationSuccessEmail({
            email: mandate.loanApplication.applicantEmail,
            name: mandate.loanApplication.applicantName,
            loanRefId: mandate.loanApplication.refId,
            emiAmount: mandate.loanApplication.emiAmount,
            tenure: mandate.loanApplication.tenure,
            firstEmiDate: firstEmiDate.toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })
        });
    } catch (emailError) {
        console.error('Failed to send success email:', emailError);
    }

    console.log(`Mandate ${mandateId} activated successfully. Loan ready for disbursement.`);
};

const handlePaymentAuthorized = async (payload) => {
    const paymentEntity = payload.payment.entity;
    const paymentId = paymentEntity.id;

    const autoPayment = await prisma.autoPayment.findUnique({
        where: { razorpayPaymentId: paymentId }
    });

    if (autoPayment) {
        await prisma.autoPayment.update({
            where: { razorpayPaymentId: paymentId },
            data: {
                status: "AUTHORIZED",
                method: paymentEntity.method
            }
        });
    }

    console.log(`Payment ${paymentId} authorized`);
};

const handlePaymentCaptured = async (payload) => {
    const paymentEntity = payload.payment.entity;
    const paymentId = paymentEntity.id;
    const amountPaid = paymentEntity.amount / 100;

    console.log(`Processing payment capture: ${paymentId}, Amount: ₹${amountPaid}`);

    const autoPayment = await prisma.autoPayment.findUnique({
        where: { razorpayPaymentId: paymentId },
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

    if (!autoPayment) {
        console.error(`Auto payment not found for payment ID: ${paymentId}`);
        return;
    }

    const loanAccount = autoPayment.mandate.loanApplication.loanAccount;

    if (!loanAccount) {
        console.error(`Loan account not found for payment ID: ${paymentId}`);
        return;
    }

    const principalAmount = parseFloat(loanAccount.principalAmount);
    const interestAmount = parseFloat(loanAccount.interestAmount);
    const totalOutstanding = parseFloat(loanAccount.totalOutstanding);
    const totalPaid = parseFloat(loanAccount.totalPaid);

    const totalRemaining = principalAmount + interestAmount;
    const interestPortion = totalRemaining > 0
        ? (amountPaid * interestAmount) / totalRemaining
        : 0;
    const principalPortion = amountPaid - interestPortion;

    const newInterestAmount = Math.max(0, interestAmount - interestPortion);
    const newPrincipalAmount = Math.max(0, principalAmount - principalPortion);
    const newTotalOutstanding = Math.max(0, totalOutstanding - amountPaid);

    await prisma.$transaction(async (tx) => {
        await tx.autoPayment.update({
            where: { razorpayPaymentId: paymentId },
            data: {
                status: "CAPTURED",
                paymentDate: new Date(),
                principalAmount: principalPortion,
                interestAmount: interestPortion,
                method: paymentEntity.method,
                loanAccountId: loanAccount.id
            }
        });

        await tx.repayment.create({
            data: {
                loanAccountId: loanAccount.id,
                amountPaid,
                paymentDate: new Date(),
                paymentMode: "UPI",
                utrId: paymentId,
                principalAmount: principalPortion,
                interestAmount: interestPortion,
                totalOutstanding: newTotalOutstanding
            }
        });

        await tx.loanAccount.update({
            where: { id: loanAccount.id },
            data: {
                principalAmount: newPrincipalAmount,
                interestAmount: newInterestAmount,
                totalOutstanding: newTotalOutstanding,
                totalPaid: totalPaid + amountPaid
            }
        });

        const emiScheduleId = paymentEntity.notes?.emi_schedule_id;
        if (emiScheduleId) {
            await tx.eMISchedule.update({
                where: { id: emiScheduleId },
                data: {
                    status: "SUCCESS",
                    paidDate: new Date(),
                    paymentId
                }
            });
        }

        if (newTotalOutstanding <= 0) {
            console.log(`Loan ${loanAccount.loanAccountNo} is fully paid. Closing...`);

            await tx.loanApplication.update({
                where: { id: loanAccount.loanApplicationId },
                data: { status: "CLOSED" }
            });

            await tx.closureCertificate.create({
                data: {
                    loanApplicationId: loanAccount.loanApplicationId
                }
            });

            await tx.eNachMandate.update({
                where: { loanApplicationId: loanAccount.loanApplicationId },
                data: { status: "COMPLETED" }
            });

            console.log(`Loan ${loanAccount.loanAccountNo} closed successfully`);
        }
    });

    console.log(`Payment ${paymentId} captured and repayment processed successfully`);
};

const handlePaymentFailed = async (payload) => {
    const paymentEntity = payload.payment.entity;
    const paymentId = paymentEntity.id;
    const failureReason = paymentEntity.error_description || paymentEntity.error_reason || "Payment failed";

    console.log(`Payment failed: ${paymentId}, Reason: ${failureReason}`);

    const autoPayment = await prisma.autoPayment.findUnique({
        where: { razorpayPaymentId: paymentId }
    });

    if (autoPayment) {
        await prisma.$transaction(async (tx) => {
            await tx.autoPayment.update({
                where: { razorpayPaymentId: paymentId },
                data: {
                    status: "FAILED",
                    failureReason
                }
            });

            const emiScheduleId = paymentEntity.notes?.emi_schedule_id;
            if (emiScheduleId) {
                await tx.eMISchedule.update({
                    where: { id: emiScheduleId },
                    data: {
                        status: "FAILED",
                        failureReason,
                        retryCount: { increment: 1 }
                    }
                });
            }
        });
    }

    console.log(`Payment ${paymentId} marked as failed`);
};

const handleTokenCancelled = async (payload) => {
    const tokenEntity = payload.token.entity;
    const mandateId = tokenEntity.id;

    await prisma.eNachMandate.update({
        where: { mandateId },
        data: { status: "CANCELLED" }
    });

    console.log(`Mandate ${mandateId} cancelled`);
};

const handleTokenPaused = async (payload) => {
    const tokenEntity = payload.token.entity;
    const mandateId = tokenEntity.id;

    await prisma.eNachMandate.update({
        where: { mandateId },
        data: { status: "PAUSED" }
    });

    console.log(`Mandate ${mandateId} paused`);
};

const handleTokenResumed = async (payload) => {
    const tokenEntity = payload.token.entity;
    const mandateId = tokenEntity.id;

    await prisma.eNachMandate.update({
        where: { mandateId },
        data: { status: "ACTIVE" }
    });

    console.log(`Mandate ${mandateId} resumed`);
};

module.exports = {
    handleRazorpayWebhook
};