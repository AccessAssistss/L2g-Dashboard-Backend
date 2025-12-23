const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("./utils/asyncHandler");
const fs = require('fs');
const XLSX = require('xlsx');
const { calculateEMI } = require("./helper/calculateEMI");

const prisma = new PrismaClient();

// ##########----------Bulk Import Loans Controller----------##########
const bulkImportLoans = asyncHandler(async (req, res) => {
    const { partnerId, courseId, schemeId } = req.body;

    if (!partnerId || !courseId || !schemeId) {
        return res.respond(400, "Partner ID, Course ID, and Scheme ID are required");
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
        where: { id: schemeId }
    });
    if (!scheme || scheme.partnerId !== partnerId) {
        return res.respond(404, "Scheme not found or does not belong to selected partner");
    }
    if (!scheme.isActive) {
        return res.respond(400, "Selected scheme is not active");
    }

    const excelFile = req.file;
    if (!excelFile) {
        return res.respond(400, "Excel file is required");
    }

    let workbook;
    try {
        workbook = XLSX.readFile(excelFile.path);
    } catch (error) {
        return res.respond(400, "Invalid Excel file format");
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
        return res.respond(400, "Excel file is empty");
    }

    const results = {
        total: data.length,
        successful: [],
        failed: []
    };

    for (let i = 0; i < data.length; i++) {
        const row = data[i];

        try {
            const refId = row['Loan Number'];

            const existingLoan = await prisma.loanApplication.findFirst({
                where: { refId }
            });

            if (existingLoan) {
                results.failed.push({
                    row: i + 2,
                    refId,
                    applicantName: row['Applicant Name'],
                    reason: "Loan number already exists"
                });
                continue;
            }

            const tuitionFees = parseFloat(row['Tuition Fees']) || 0;
            const otherCharges = parseFloat(row['Other Charges']) || 0;
            const totalFees = parseFloat(row['Total Fees']) || 0;
            const monthlyIncome = parseInt(row['Monthly Income']) || 0;
            const loanAmount = parseFloat(row['Loan Amount']) || 0;
            const loanAmountRequested = parseFloat(row['Loan Amount Requested']) || 0;
            const disbursedAmount = parseFloat(row['Disbursed Amount']) || 0;
            const interestRate = parseFloat(row['Interest']) || 0;
            const tenure = parseInt(row['Tenure']) || 12;

            const genderMap = {
                'MALE': 'MALE',
                'FEMALE': 'FEMALE',
                'M': 'MALE',
                'F': 'FEMALE',
                'Male': 'MALE',
                'Female': 'FEMALE'
            };
            const applicantGender = genderMap[row['Applicant Gender']] || 'OTHER';

            let semesterFunding = [];

            if (row['Semester Funding']) {
                try {
                    semesterFunding = JSON.parse(row['Semester Funding']);

                    if (!Array.isArray(semesterFunding) || semesterFunding.length === 0) {
                        throw new Error("Semester Funding must be a non-empty array");
                    }

                    semesterFunding.forEach(sem => {
                        if (!sem.semester || !sem.fees || Number(sem.fees) <= 0) {
                            throw new Error("Invalid semester funding structure");
                        }
                    });

                } catch (err) {
                    console.log(err)
                    results.failed.push({
                        row: i + 2,
                        refId,
                        applicantName: row['Applicant Name'],
                        reason: "Invalid Semester Funding JSON"
                    });
                    continue;
                }
            }

            const result = await prisma.$transaction(async (tx) => {
                const loanApplication = await tx.loanApplication.create({
                    data: {
                        refId,
                        partnerId,
                        courseId,
                        schemeId,
                        applicantName: row['Applicant Name'] || '',
                        applicantPhone: String(row['Applicant Phone'] || ''),
                        alternativeApplicantPhone: String(row['Alternative Applicant Phone'] || ''),
                        applicantEmail: row['Applicant Email'] || '',
                        applicantGender,
                        guardianName: row['Guardian Name'] || '',
                        guardianPhone: String(row['Guardian Phone'] || ''),
                        alternativeGuardianPhone: String(row['Alternative Guardian Phone'] || ''),
                        guardianEmail: row['Guardian Email'] || '',
                        relationship: row['Relationship'] || 'Father',
                        tuitionFees,
                        otherCharges,
                        totalFees,
                        monthlyIncome,
                        loanAmount,
                        loanAmountRequested,
                        interestRate,
                        tenure,
                        status: "PENDING"
                    }
                });

                if (semesterFunding.length > 0) {
                    await tx.loanSemesterFunding.createMany({
                        data: semesterFunding.map(sem => ({
                            loanApplicationId: loanApplication.id,
                            semester: sem.semester,
                            fees: Number(sem.fees)
                        }))
                    });
                }

                await tx.kYC.create({
                    data: {
                        loanApplicationId: loanApplication.id,
                        studentAadharFront: row['Student Aadhar Front'] || null,
                        studentAadharBack: row['Student Aadhar Back'] || null,
                        studentPanCard: row['Student Pan'] || null,
                        guardianAadharFront: row['Guardian Aadhar Front'] || null,
                        guardianAadharBack: row['Guardian Aadhar Back'] || null,
                        guardianPanCard: row['Guardian Pan'] || null,
                        videoKycLink: null,
                        isVKYCApproved: true,
                        approvedAt: new Date()
                    }
                });

                const emiAmount = calculateEMI(
                    loanAmount,
                    interestRate,
                    tenure,
                    scheme.interestType,
                    scheme.interestPaidBy
                );

                await tx.loanApplication.update({
                    where: { id: loanApplication.id },
                    data: {
                        status: "APPROVED",
                        emiAmount: parseFloat(emiAmount.toFixed(2))
                    }
                });

                const advanceEMIPaid = false;
                const advanceEMIAmount = 0;

                let totalInterest = 0;
                let totalOutstanding = 0;
                let remainingPrincipal = loanAmount;
                let remainingInterest = 0;

                if (scheme.interestPaidBy === "PARTNER") {
                    totalInterest = 0;
                    totalOutstanding = loanAmount;
                } else if (scheme.interestType === "FLAT") {
                    totalInterest = (loanAmount * interestRate * tenure) / (12 * 100);
                    totalOutstanding = loanAmount + totalInterest;
                    remainingInterest = totalInterest;
                } else {
                    totalInterest = 0;
                    totalOutstanding = loanAmount;
                }

                await tx.disbursement.create({
                    data: {
                        loanApplicationId: loanApplication.id,
                        disbursedAmount,
                        interestRate,
                        tenure,
                        advanceEMIPaid,
                        advanceEMIAmount: 0,
                        interestPaidBy: scheme.interestPaidBy
                    }
                });

                const loanAccount = await tx.loanAccount.create({
                    data: {
                        loanApplicationId: loanApplication.id,
                        principalAmount: Math.max(0, remainingPrincipal),
                        interestAmount: Math.max(0, remainingInterest),
                        totalOutstanding: Math.max(0, totalOutstanding),
                        totalPaid: 0
                    }
                });

                await tx.loanApplication.update({
                    where: { id: loanApplication.id },
                    data: { status: "DISBURSED" }
                });
                return loanApplication;
            });

            results.successful.push({
                row: i + 2,
                refId,
                loanApplicationId: result.id,
                applicantName: result.applicantName,
                loanAmount,
                tenure
            });

        } catch (error) {
            console.log(error)
            results.failed.push({
                row: i + 2,
                refId: row['Loan Number'],
                applicantName: row['Applicant Name'],
                reason: error.message
            });
        }
    }

    try {
        fs.unlinkSync(excelFile.path);
    } catch (err) {
        console.error('Error deleting uploaded file:', err);
    }

    res.respond(200, "Bulk import completed", {
        summary: {
            total: results.total,
            successful: results.successful.length,
            failed: results.failed.length
        },
        details: results
    });
});

module.exports = {
    bulkImportLoans,
};