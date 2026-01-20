const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");

const prisma = new PrismaClient();

const createLoanScheme = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { partnerId, courseId, schemeName, interestType, interestPaidBy, academicYearStartDate, academicYearEndDate } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });

    if (!user || user.userType !== "ADMIN") {
        return res.respond(403, "Only admins can create loan schemes");
    }

    if (!partnerId || !schemeName || !interestType || !interestPaidBy || !academicYearStartDate || !academicYearEndDate) {
        return res.respond(400, "All fields are required: partnerId, schemeName, interestType, interestPaidBy");
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

    const schemeType = courseId ? "COURSE_SPECIFIC" : "PARTNER_LEVEL";

    if (courseId) {
        const course = await prisma.course.findUnique({
            where: { id: courseId }
        });

        if (!course) {
            return res.respond(404, "Course not found");
        }

        if (course.partnerId !== partnerId) {
            return res.respond(400, "Course does not belong to the specified partner");
        }
    }

    const existingScheme = await prisma.loanScheme.findUnique({
        where: { schemeName }
    });

    if (existingScheme) {
        return res.respond(400, "Scheme with this name already exists");
    }

    const startDate = new Date(academicYearStartDate);
    const endDate = new Date(academicYearEndDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.respond(400, "Invalid date format for academic year dates");
    }

    if (endDate <= startDate) {
        return res.respond(400, "Academic year end date must be after start date");
    }

    const scheme = await prisma.loanScheme.create({
        data: {
            partner: {
                connect: { id: partnerId }
            },
            ...(courseId && {
                course: {
                    connect: { id: courseId }
                }
            }),
            schemeName,
            interestType,
            interestPaidBy,
            academicYearStartDate: startDate,
            academicYearEndDate: endDate
        }
    });

    res.respond(201, `${schemeType} loan scheme created successfully`, {
        ...scheme,
        schemeType
    });
});

// ##########----------Get All Loan Schemes----------##########
const getAllLoanSchemes = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search = "", partnerId, courseId, isActive, schemeType } = req.query;

    const skip = (page - 1) * limit;

    const searchFilter = search
        ? {
            OR: [
                { schemeName: { contains: search, mode: "insensitive" } }
            ]
        }
        : {};

    const filter = {
        ...searchFilter,
        ...(partnerId ? { partnerId } : {}),
        ...(isActive !== undefined ? { isActive: isActive === "true" } : {})
    };

    if (schemeType === "PARTNER_LEVEL") {
        filter.courseId = null;
    } else if (schemeType === "COURSE_SPECIFIC") {
        filter.courseId = { not: null };
    }

    if (courseId) {
        filter.courseId = courseId;
    }

    const total = await prisma.loanScheme.count({
        where: filter
    });

    const schemes = await prisma.loanScheme.findMany({
        where: filter,
        skip: Number(skip),
        take: Number(limit),
        include: {
            partner: true,
            course: true,
            _count: {
                select: { applications: true }
            }
        },
        orderBy: { createdAt: "desc" }
    });

    const schemesWithType = schemes.map(scheme => ({
        ...scheme,
        schemeType: scheme.courseId ? "COURSE_SPECIFIC" : "PARTNER_LEVEL"
    }));

    res.respond(200, "Loan schemes fetched successfully", {
        total,
        page: Number(page),
        limit: Number(limit),
        data: schemesWithType
    });
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
    const { partnerId, courseId } = req.query;

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

    res.respond(200, "Loan Schemes fetched successfully", schemes);
});

module.exports = {
    createLoanScheme,
    getAllLoanSchemes,
    updateLoanScheme,
    deleteLoanScheme,
    getSchemesByPartnerAndCourse
};