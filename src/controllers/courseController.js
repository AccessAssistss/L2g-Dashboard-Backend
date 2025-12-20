const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");

const prisma = new PrismaClient();

// ##########----------Create Course----------##########
const createCourse = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { partnerId, name } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });

    if (!user || user.userType !== "ADMIN") {
        return res.respond(403, "Only admins can create courses");
    }

     if (!partnerId || !name) {
        return res.respond(400, "Partner ID and course name are required");
    }
    const partner = await prisma.partner.findUnique({
        where: { id: partnerId }
    });

    if (!partner) {
        return res.respond(404, "Partner not found");
    }

    const existingCourse = await prisma.course.findFirst({
        where: {
            partnerId,
            name
        }
    });

    if (existingCourse) {
        return res.respond(400, "Course with this name already exists for this partner");
    }

    const baseCode = name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 8);
    
    let code = baseCode;
    let counter = 1;
    let codeExists = await prisma.course.findFirst({ 
        where: { 
            partnerId,
            code 
        } 
    });
    
    while (codeExists) {
        code = `${baseCode}${counter}`;
        codeExists = await prisma.course.findFirst({ 
            where: { 
                partnerId,
                code 
            } 
        });
        counter++;
    }

    const course = await prisma.course.create({
        data: {
            partnerId,
            name,
            code
        },
        include: {
            partner: true
        }
    });

    res.respond(201, "Course created successfully", course);
});

// ##########----------Get All Courses----------##########
const getAllCourses = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search = "", partnerId, isActive } = req.query;

    const skip = (page - 1) * limit;

    const searchFilter = search
        ? {
            OR: [
                { name: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } }
            ]
        }
        : {};

    const filter = {
        ...searchFilter,
        ...(partnerId ? { partnerId } : {}),
        ...(isActive !== undefined ? { isActive: isActive === "true" } : {})
    };

    const total = await prisma.course.count({
        where: filter
    });

    const courses = await prisma.course.findMany({
        where: filter,
        skip: Number(skip),
        take: Number(limit),
        include: {
            partner: true,
            _count: {
                select: {
                    loanSchemes: true,
                    applications: true
                }
            }
        },
        orderBy: { createdAt: "desc" }
    });

    res.respond(200, "Courses fetched successfully", {
        total,
        page: Number(page),
        limit: Number(limit),
        data: courses
    });
});

// ##########----------Update Course----------##########
const updateCourse = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { id } = req.params;
    const { name, isActive } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });

    if (!user || user.userType !== "ADMIN") {
        return res.respond(403, "Only admins can update courses");
    }

    const course = await prisma.course.findUnique({
        where: { id }
    });

    if (!course) {
        return res.respond(404, "Course not found");
    }

    const updateData = {
        isActive: isActive !== undefined ? isActive : course.isActive
    };

    if (name && name !== course.name) {
        const existingCourse = await prisma.course.findFirst({
            where: {
                partnerId: course.partnerId,
                name,
                id: { not: id }
            }
        });

        if (existingCourse) {
            return res.respond(400, "Course with this name already exists for this partner");
        }

        updateData.name = name;

        const baseCode = name
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .substring(0, 8);
        
        let code = baseCode;
        let counter = 1;
        let codeExists = await prisma.course.findFirst({ 
            where: { 
                partnerId: course.partnerId,
                code,
                id: { not: id }
            } 
        });
        
        while (codeExists) {
            code = `${baseCode}${counter}`;
            codeExists = await prisma.course.findFirst({ 
                where: { 
                    partnerId: course.partnerId,
                    code,
                    id: { not: id }
                } 
            });
            counter++;
        }

        updateData.code = code;
    }

    const updatedCourse = await prisma.course.update({
        where: { id },
        data: updateData,
        include: {
            partner: true
        }
    });

    res.respond(200, "Course updated successfully", updatedCourse);
});

// ##########----------Delete Course----------##########
const deleteCourse = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { id } = req.params;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });

    if (!user || user.userType !== "ADMIN") {
        return res.respond(403, "Only admins can delete courses");
    }

    const course = await prisma.course.findUnique({
        where: { id },
        include: {
            _count: {
                select: { applications: true }
            }
        }
    });

    if (!course) {
        return res.respond(404, "Course not found");
    }

    if (course._count.applications > 0) {
        return res.respond(400, "Cannot delete course with existing loan applications");
    }

    await prisma.course.delete({
        where: { id }
    });

    res.respond(200, "Course deleted successfully");
});

// ##########----------Get Courses By Partner (For Agents)----------##########
const getCoursesByPartnerForAgents = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { partnerId } = req.params;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const courses = await prisma.course.findMany({
        where: {
            partnerId,
            isActive: true
        },
        orderBy: { name: "asc" }
    });

    res.respond(200, "Courses fetched successfully", courses);
});

module.exports = {
    createCourse,
    getAllCourses,
    updateCourse,
    deleteCourse,
    getCoursesByPartnerForAgents
};