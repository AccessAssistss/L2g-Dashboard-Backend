const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");

const prisma = new PrismaClient();

const createLoanScheme = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { partnerId, courseId, schemeName, interestType, interestPaidBy } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });

    if (!user || user.userType !== "ADMIN") {
        return res.respond(403, "Only admins can create loan schemes");
    }

    if (!partnerId || !courseId || !schemeName || !interestType || !interestPaidBy) {
        return res.respond(400, "All fields are required: partnerId, courseId, schemeName, interestType, interestPaidBy");
    }

    if (!["FLAT", "REDUCING"].includes(interestType)) {
        return res.respond(400, "Interest type must be FLAT or REDUCING");
    }

    if (!["STUDENT", "PARTNER"].includes(interestPaidBy)) {
        return res.respond(400, "Interest paid by must be STUDENT or PARTNER");
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

    if (!course) {
        return res.respond(404, "Course not found");
    }

    if (course.partnerId !== partnerId) {
        return res.respond(400, "Course does not belong to the specified partner");
    }

    const existingScheme = await prisma.loanScheme.findUnique({
        where: { schemeName }
    });

    if (existingScheme) {
        return res.respond(400, "Scheme with this name already exists");
    }

    const scheme = await prisma.loanScheme.create({
        data: {
            partnerId,
            courseId,
            schemeName,
            interestType,
            interestPaidBy
        },
        include: {
            partner: true,
            course: true
        }
    });

    res.respond(201, "Loan scheme created successfully", scheme);
});

// ##########----------Get All Loan Schemes----------##########
const getAllLoanSchemes = asyncHandler(async (req, res) => {
    const { partnerId, courseId, isActive } = req.query;

    const filter = {};
    if (partnerId) filter.partnerId = partnerId;
    if (courseId) filter.courseId = courseId;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const schemes = await prisma.loanScheme.findMany({
        where: filter,
        include: {
            partner: true,
            course: true,
            _count: {
                select: { applications: true }
            }
        },
        orderBy: { createdAt: "desc" }
    });

    res.respond(200, "Loan schemes fetched successfully", schemes);
});

// ##########----------Update Loan Scheme----------##########
const updateLoanScheme = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { id } = req.params;
    const { schemeName, interestType, interestPaidBy, isActive } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });

    if (!user || user.userType !== "ADMIN") {
        return res.respond(403, "Only admins can update loan schemes");
    }

    const scheme = await prisma.loanScheme.findUnique({
        where: { id }
    });

    if (!scheme) {
        return res.respond(404, "Loan scheme not found");
    }

    if (interestType && !["FLAT", "REDUCING"].includes(interestType)) {
        return res.respond(400, "Interest type must be FLAT or REDUCING");
    }

    if (interestPaidBy && !["STUDENT", "PARTNER"].includes(interestPaidBy)) {
        return res.respond(400, "Interest paid by must be STUDENT or PARTNER");
    }

    const updatedScheme = await prisma.loanScheme.update({
        where: { id },
        data: {
            schemeName: schemeName || scheme.schemeName,
            interestType: interestType || scheme.interestType,
            interestPaidBy: interestPaidBy || scheme.interestPaidBy,
            isActive: isActive !== undefined ? isActive : scheme.isActive
        },
        include: {
            partner: true,
            course: true
        }
    });

    res.respond(200, "Loan scheme updated successfully", updatedScheme);
});

// ##########----------Delete Loan Scheme----------##########
const deleteLoanScheme = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { id } = req.params;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });

    if (!user || user.userType !== "ADMIN") {
        return res.respond(403, "Only admins can delete loan schemes");
    }

    const scheme = await prisma.loanScheme.findUnique({
        where: { id },
        include: {
            _count: {
                select: { applications: true }
            }
        }
    });

    if (!scheme) {
        return res.respond(404, "Loan scheme not found");
    }

    if (scheme._count.applications > 0) {
        return res.respond(400, "Cannot delete scheme with existing loan applications");
    }

    await prisma.loanScheme.delete({
        where: { id }
    });

    res.respond(200, "Loan scheme deleted successfully");
});

// ##########----------Get Schemes By Partner and Course (For Agents)----------##########
const getSchemesByPartnerAndCourse = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { partnerId, courseId } = req.params;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const schemes = await prisma.loanScheme.findMany({
        where: {
            partnerId,
            courseId,
            isActive: true
        },
        select: {
            id: true,
            schemeName: true
        },
        orderBy: { schemeName: "asc" }
    });

    res.respond(200, "Schemes fetched successfully", schemes);
});

module.exports = {
    createLoanScheme,
    getAllLoanSchemes,
    updateLoanScheme,
    deleteLoanScheme,
    getSchemesByPartnerAndCourse
};