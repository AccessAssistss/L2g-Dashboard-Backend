const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");

const prisma = new PrismaClient();

// ##########----------Create Partner----------##########
const createPartner = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { name, code } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });

    if (!user || user.userType !== "ADMIN") {
        return res.respond(403, "Only admins can create partners");
    }

    if (!name || !code) {
        return res.respond(400, "Name and code are required");
    }

    const existingPartner = await prisma.partner.findFirst({
        where: {
            OR: [
                { name },
                { code }
            ]
        }
    });

    if (existingPartner) {
        return res.respond(400, "Partner with this name or code already exists");
    }

    const partner = await prisma.partner.create({
        data: { name, code }
    });

    res.respond(201, "Partner created successfully", partner);
});

// ##########----------Get All Partners----------##########
const getAllPartners = asyncHandler(async (req, res) => {
    const { isActive } = req.query;

    const filter = isActive !== undefined ? { isActive: isActive === "true" } : {};

    const partners = await prisma.partner.findMany({
        where: filter,
        include: {
            _count: {
                select: {
                    courses: true,
                    loanSchemes: true,
                    applications: true
                }
            }
        },
        orderBy: { createdAt: "desc" }
    });

    res.respond(200, "Partners fetched successfully", partners);
});

// ##########----------Update Partner----------##########
const updatePartner = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { id } = req.params;
    const { name, code, isActive } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });

    if (!user || user.userType !== "ADMIN") {
        return res.respond(403, "Only admins can update partners");
    }

    const partner = await prisma.partner.findUnique({
        where: { id }
    });

    if (!partner) {
        return res.respond(404, "Partner not found");
    }

    const updatedPartner = await prisma.partner.update({
        where: { id },
        data: {
            name: name || partner.name,
            code: code || partner.code,
            isActive: isActive !== undefined ? isActive : partner.isActive
        }
    });

    res.respond(200, "Partner updated successfully", updatedPartner);
});

// ##########----------Delete Partner----------##########
const deletePartner = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { id } = req.params;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });

    if (!user || user.userType !== "ADMIN") {
        return res.respond(403, "Only admins can delete partners");
    }

    const partner = await prisma.partner.findUnique({
        where: { id },
        include: {
            _count: {
                select: { applications: true }
            }
        }
    });

    if (!partner) {
        return res.respond(404, "Partner not found");
    }

    if (partner._count.applications > 0) {
        return res.respond(400, "Cannot delete partner with existing loan applications");
    }

    await prisma.partner.delete({
        where: { id }
    });

    res.respond(200, "Partner deleted successfully");
});

module.exports = {
    createPartner,
    getAllPartners,
    updatePartner,
    deletePartner,
};