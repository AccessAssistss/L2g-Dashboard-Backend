const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const { sendENachActivationSuccessEmail } = require("../../utils/mailSender");

const prisma = new PrismaClient();

// ##########----------Verify Razorpay Webhook Signature----------##########
const verifyRazorpayWebhook = (req) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        
        if (!signature) {
            console.error("[WEBHOOK] No signature in headers");
            return false;
        }

        const body = req.body.toString('utf8');
        
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(body)
            .digest('hex');

        const isValid = signature === expectedSignature;
        
        if (!isValid) {
            console.error("[WEBHOOK] Signature mismatch");
            console.error("Received:", signature);
            console.error("Expected:", expectedSignature);
        }
        
        return isValid;
    } catch (error) {
        console.error("[WEBHOOK] Signature verification error:", error);
        return false;
    }
};

// ##########----------Handle Razorpay Webhook----------##########
const handleRazorpayWebhook = async (req, res) => {
    try {
        const isValid = verifyRazorpayWebhook(req);

        if (!isValid) {
            console.error("[WEBHOOK] Invalid signature");
            return res.status(400).json({
                success: false,
                message: "Invalid webhook signature"
            });
        }

        let parsedBody;
        try {
            const bodyString = req.body.toString('utf8');
            parsedBody = JSON.parse(bodyString);
        } catch (parseError) {
            console.error("[WEBHOOK] JSON parse error:", parseError);
            return res.status(400).json({
                success: false,
                message: "Invalid JSON payload"
            });
        }

        const event = parsedBody.event;
        const payload = parsedBody.payload;

        console.log(`[WEBHOOK] Event received: ${event}`);
        console.log(`[WEBHOOK] Payload:`, JSON.stringify(payload, null, 2));

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
            case "token.rejected":
                await handleTokenCancelled(payload);
                break;

            case "token.paused":
                await handleTokenPaused(payload);
                break;

            case "token.resumed":
                await handleTokenResumed(payload);
                break;

            default:
                console.log(`[WEBHOOK] Unhandled event: ${event}`);
        }

        res.status(200).json({ success: true, message: "Webhook processed" });

    } catch (error) {
        console.error("[WEBHOOK] Error:", error);
        res.status(500).json({
            success: false,
            message: "Webhook processing failed",
            error: error.message
        });
    }
};

const handleTokenConfirmed = async (payload) => {
    try {
        const tokenEntity = payload.token?.entity;
        
        if (!tokenEntity) {
            console.error("[TOKEN_CONFIRMED] No token entity in payload");
            return;
        }

        const tokenId = tokenEntity.id;
        const orderId = tokenEntity.order_id;
        
        console.log(`[TOKEN_CONFIRMED] Processing token: ${tokenId}, Order ID: ${orderId}`);

        const mandate = await prisma.eNachMandate.findFirst({
            where: { 
                mandateId: orderId
            },
            include: {
                loanApplication: true
            }
        });

        if (!mandate) {
            console.error(`[TOKEN_CONFIRMED] Mandate not found for order: ${orderId}`);
            return;
        }

        console.log(`[TOKEN_CONFIRMED] Found mandate for loan: ${mandate.loanApplication.refId}`);

        const bankAccount = tokenEntity.bank_account || {};
        const bankAccountNo = bankAccount.account_number || mandate.bankAccountNo;
        const ifscCode = bankAccount.ifsc || mandate.ifscCode;
        const accountType = bankAccount.account_type || mandate.accountType;

        console.log(`[TOKEN_CONFIRMED] Bank details - Account: ${bankAccountNo}, IFSC: ${ifscCode}`);

        await prisma.$transaction(async (tx) => {
            await tx.eNachMandate.update({
                where: { id: mandate.id },
                data: {
                    status: "ACTIVE",
                    tokenId: tokenId,
                    bankAccountNo: bankAccountNo,
                    ifscCode: ifscCode,
                    accountType: accountType
                }
            });

            await tx.loanApplication.update({
                where: { id: mandate.loanApplicationId },
                data: { status: "ENACH_ACTIVE" }
            });

            console.log(`[TOKEN_CONFIRMED] Updated mandate status to ACTIVE with bank details`);
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
            console.log(`[TOKEN_CONFIRMED] Success email sent`);
        } catch (emailError) {
            console.error('[TOKEN_CONFIRMED] Email error:', emailError);
        }

        console.log(`[TOKEN_CONFIRMED] Mandate ${tokenId} activated. Loan ready for disbursement.`);
    } catch (error) {
        console.error("[TOKEN_CONFIRMED] Error:", error);
    }
};

const handlePaymentAuthorized = async (payload) => {
    try {
        const paymentEntity = payload.payment?.entity;
        
        if (!paymentEntity) {
            console.error("[PAYMENT_AUTHORIZED] No payment entity");
            return;
        }

        const paymentId = paymentEntity.id;
        console.log(`[PAYMENT_AUTHORIZED] Payment ID: ${paymentId}`);

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
            console.log(`[PAYMENT_AUTHORIZED] Updated payment ${paymentId}`);
        }
    } catch (error) {
        console.error("[PAYMENT_AUTHORIZED] Error:", error);
    }
};

const handlePaymentCaptured = async (payload) => {
    try {
        const paymentEntity = payload.payment?.entity;
        
        if (!paymentEntity) {
            console.error("[PAYMENT_CAPTURED] No payment entity");
            return;
        }

        const paymentId = paymentEntity.id;
        const amountPaid = paymentEntity.amount / 100;

        console.log(`[PAYMENT_CAPTURED] Payment: ${paymentId}, Amount: ₹${amountPaid}`);

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
            console.error(`[PAYMENT_CAPTURED] Payment not found: ${paymentId}`);
            return;
        }

        const loanAccount = autoPayment.mandate.loanApplication.loanAccount;

        if (!loanAccount) {
            console.error(`[PAYMENT_CAPTURED] Loan account not found for payment: ${paymentId}`);
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
                console.log(`[PAYMENT_CAPTURED] Loan fully paid`);

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
            }
        });

        console.log(`[PAYMENT_CAPTURED] Payment ${paymentId} processed successfully`);
    } catch (error) {
        console.error("[PAYMENT_CAPTURED] Error:", error);
    }
};

const handlePaymentFailed = async (payload) => {
    try {
        const paymentEntity = payload.payment?.entity;
        
        if (!paymentEntity) {
            console.error("[PAYMENT_FAILED] No payment entity");
            return;
        }

        const paymentId = paymentEntity.id;
        const failureReason = paymentEntity.error_description || 
                             paymentEntity.error_reason || 
                             "Payment failed";

        console.log(`[PAYMENT_FAILED] Payment: ${paymentId}, Reason: ${failureReason}`);

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
            console.log(`[PAYMENT_FAILED] Updated payment ${paymentId}`);
        }
    } catch (error) {
        console.error("[PAYMENT_FAILED] Error:", error);
    }
};

const handleTokenCancelled = async (payload) => {
    try {
        const tokenEntity = payload.token?.entity;
        
        if (!tokenEntity) {
            console.error("[TOKEN_CANCELLED] No token entity");
            return;
        }

        const tokenId = tokenEntity.id;
        const orderId = tokenEntity.order_id;
        console.log(`[TOKEN_CANCELLED] Token: ${tokenId}, Order: ${orderId}`);

        const mandate = await prisma.eNachMandate.findFirst({
            where: { mandateId: orderId }
        });

        if (mandate) {
            await prisma.$transaction(async (tx) => {
                await tx.eNachMandate.update({
                    where: { id: mandate.id },
                    data: { 
                        status: "CANCELLED",
                        tokenId: tokenId 
                    }
                });

                await tx.loanApplication.update({
                    where: { id: mandate.loanApplicationId },
                    data: { status: "APPROVED" }
                });
            });
            console.log(`[TOKEN_CANCELLED] Mandate ${orderId} cancelled`);
        }
    } catch (error) {
        console.error("[TOKEN_CANCELLED] Error:", error);
    }
};

const handleTokenPaused = async (payload) => {
    try {
        const tokenEntity = payload.token?.entity;
        
        if (!tokenEntity) {
            console.error("[TOKEN_PAUSED] No token entity");
            return;
        }

        const tokenId = tokenEntity.id;
        const orderId = tokenEntity.order_id;
        console.log(`[TOKEN_PAUSED] Token: ${tokenId}, Order: ${orderId}`);

        const mandate = await prisma.eNachMandate.findFirst({
            where: { 
                OR: [
                    { tokenId: tokenId },
                    { mandateId: orderId }
                ]
            }
        });

        if (mandate) {
            await prisma.eNachMandate.update({
                where: { id: mandate.id },
                data: { status: "PAUSED" }
            });
            
            console.log(`[TOKEN_PAUSED] Mandate ${mandate.id} paused`);
        }
    } catch (error) {
        console.error("[TOKEN_PAUSED] Error:", error);
    }
};

const handleTokenResumed = async (payload) => {
    try {
        const tokenEntity = payload.token?.entity;
        
        if (!tokenEntity) {
            console.error("[TOKEN_RESUMED] No token entity");
            return;
        }

        const tokenId = tokenEntity.id;
        const orderId = tokenEntity.order_id;
        console.log(`[TOKEN_RESUMED] Token: ${tokenId}, Order: ${orderId}`);

        const mandate = await prisma.eNachMandate.findFirst({
            where: { 
                OR: [
                    { tokenId: tokenId },
                    { mandateId: orderId }
                ]
            }
        });

        if (mandate) {
            await prisma.eNachMandate.update({
                where: { id: mandate.id },
                data: { status: "ACTIVE" }
            });
            
            console.log(`[TOKEN_RESUMED] Mandate ${mandate.id} resumed`);
        }
    } catch (error) {
        console.error("[TOKEN_RESUMED] Error:", error);
    }
};

module.exports = {
    handleRazorpayWebhook
};