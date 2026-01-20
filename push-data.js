const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("./utils/asyncHandler");
const fs = require('fs');
const XLSX = require('xlsx');
const { calculateEMI } = require("./helper/calculateEMI");

const prisma = new PrismaClient();

// ##########----------Bulk Import Loans Controller----------##########
const bulkImportLoans = asyncHandler(async (req, res) => {
    const { partnerId, schemeId } = req.body;

    if (!partnerId || !schemeId) {
        return res.respond(400, "Partner ID, and Scheme ID are required");
    }

    const partner = await prisma.partner.findUnique({
        where: { id: partnerId }
    });
    if (!partner) {
        return res.respond(404, "Partner not found");
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

    const partnerCourses = await prisma.course.findMany({
        where: {
            partnerId,
            isActive: true
        }
    });

    const courseMap = {};
    partnerCourses.forEach(course => {
        courseMap[course.name.toLowerCase().trim()] = course;
    })

    for (let i = 0; i < data.length; i++) {
        const row = data[i];

        try {
            const refId = row['Loan Number'];

            if (!refId) {
                results.failed.push({
                    row: i + 2,
                    refId: 'N/A',
                    applicantName: row['Applicant Name'],
                    reason: "Loan Number is required"
                });
                continue;
            }

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

            const courseName = row['Course'];
            if (!courseName) {
                results.failed.push({
                    row: i + 2,
                    refId,
                    applicantName: row['Applicant Name'],
                    reason: "Course name is required"
                });
                continue;
            }

            const matchedCourse = courseMap[courseName.toLowerCase().trim()];
            if (!matchedCourse) {
                results.failed.push({
                    row: i + 2,
                    refId,
                    applicantName: row['Applicant Name'],
                    reason: `Course "${courseName}" not found for this partner. Available courses: ${partnerCourses.map(c => c.name).join(', ')}`
                });
                continue;
            }

            const courseId = matchedCourse.id;

            const tuitionFees = parseFloat(row['Tuition Fees']) || 0;
            const otherCharges = parseFloat(row['Other Charges']) || 0;
            const totalFees = parseFloat(row['Total Fees']) || 0;
            const monthlyIncome = parseInt(row['Monthly Income']) || 0;
            const loanAmount = parseFloat(row['Loan Amount']) || 0;
            const loanAmountRequested = parseFloat(row['Loan Amount Requested']) || 0;
            const disbursedAmount = parseFloat(row['Disbursed Amount']) || 0;
            const interestRate = parseFloat(row['Interest']) || 0;
            const tenure = parseInt(row['Tenure']) || 12;

            if (!loanAmount || loanAmount <= 0) {
                results.failed.push({
                    row: i + 2,
                    refId,
                    applicantName: row['Applicant Name'],
                    reason: "Valid Loan Amount is required"
                });
                continue;
            }

            if (!tenure || tenure <= 0) {
                results.failed.push({
                    row: i + 2,
                    refId,
                    applicantName: row['Applicant Name'],
                    reason: "Valid Tenure is required"
                });
                continue;
            }

            const genderMap = {
                'MALE': 'MALE',
                'FEMALE': 'FEMALE',
                'M': 'MALE',
                'F': 'FEMALE',
                'Male': 'MALE',
                'Female': 'FEMALE',
                'male': 'MALE',
                'female': 'FEMALE'
            };
            const applicantGender = genderMap[row['Applicant Gender']] || 'OTHER';

            let semesterFunding = [];

            if (row['Semester Funding']) {
                try {
                    semesterFunding = JSON.parse(row['Semester Funding']);

                    if (!Array.isArray(semesterFunding)) {
                        throw new Error("Semester Funding must be a non-empty array");
                    }

                    if (semesterFunding.length === 0) {
                        throw new Error("Semester Funding array cannot be empty");
                    }

                    let semesterTotal = 0;

                    semesterFunding.forEach((sem, idx) => {
                        if (!sem.semester || typeof sem.semester !== 'string') {
                            throw new Error(`Semester ${idx + 1}: semester name is required`);
                        }
                        if (!sem.fees || isNaN(parseFloat(sem.fees)) || parseFloat(sem.fees) <= 0) {
                            throw new Error(`Semester ${idx + 1}: valid fees amount is required`);
                        }
                        semesterTotal += parseFloat(sem.fees);
                    });

                    const tolerance = 1;
                    if (Math.abs(semesterTotal - loanAmountRequested) > tolerance) {
                        console.warn(`Warning: Semester total (${semesterTotal}) doesn't match loan amount requested (${loanAmountRequested}) for loan ${refId}`);
                    }

                } catch (err) {
                    console.error(`Semester Funding Parse Error for ${refId}:`, err.message);
                    results.failed.push({
                        row: i + 2,
                        refId,
                        applicantName: row['Applicant Name'],
                        reason: `Invalid Semester Funding: ${err.message}. Expected format: [{"semester":"Semester 1","fees":50000}]`
                    });
                    continue;
                } 
            } else {
                console.warn(`No semester funding for ${refId}, creating default entry`);
                semesterFunding = [{
                    semester: "Full Course",
                    fees: loanAmountRequested || loanAmount
                }];
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
                            fees: parseFloat(sem.fees)
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
                        disbursedAmount: disbursedAmount || loanAmount,
                        interestRate,
                        tenure,
                        advanceEMIPaid: false,
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
                return {
                    loanApplication,
                    semesterCount: semesterFunding.length,
                    courseName: matchedCourse.name
                };
            });

            results.successful.push({
                row: i + 2,
                refId,
                loanApplicationId: result.loanApplication.id,
                applicantName: result.loanApplication.applicantName,
                courseName: result.courseName,
                loanAmount,
                tenure,
                semestersCreated: result.semesterCount
            });

        } catch (error) {
            console.error(`Error processing row ${i + 2}:`, error);
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