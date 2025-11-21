const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");

const prisma = new PrismaClient();

// ##########----------Create Partner----------##########
const createPartner = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { name, address } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });

    if (!user || user.userType !== "ADMIN") {
        return res.respond(403, "Only admins can create partners");
    }

    if (!name || !address) {
        return res.respond(400, "Name and address are required");
    }

    const existingPartner = await prisma.partner.findFirst({
        where: {
            OR: [
                { name }
            ]
        }
    });

    if (existingPartner) {
        return res.respond(400, "Partner with this name already exists");
    }

    const baseCode = name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 6);

    let code = baseCode;
    let counter = 1;
    let codeExists = await prisma.partner.findUnique({ where: { code } });

    while (codeExists) {
        code = `${baseCode}${counter}`;
        codeExists = await prisma.partner.findUnique({ where: { code } });
        counter++;
    }

    const partner = await prisma.partner.create({
        data: {
            name,
            code,
            address: address || null
        }
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
    const { name, address, isActive } = req.body;

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

    const updateData = {
        isActive: isActive !== undefined ? isActive : partner.isActive
    };

    // Update name and regenerate code if name changes
    if (name && name !== partner.name) {
        const existingPartner = await prisma.partner.findFirst({
            where: {
                name,
                id: { not: id }
            }
        });

        if (existingPartner) {
            return res.respond(400, "Partner with this name already exists");
        }

        updateData.name = name;

        const baseCode = name
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .substring(0, 6);

        let code = baseCode;
        let counter = 1;
        let codeExists = await prisma.partner.findFirst({
            where: {
                code,
                id: { not: id }
            }
        });

        while (codeExists) {
            code = `${baseCode}${counter}`;
            codeExists = await prisma.partner.findFirst({
                where: {
                    code,
                    id: { not: id }
                }
            });
            counter++;
        }

        updateData.code = code;
    }

    if (address !== undefined) {
        updateData.address = address;
    }

    const updatedPartner = await prisma.partner.update({
        where: { id },
        data: updateData
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

// ##########----------Get Partners For Agents----------##########
const getPartnersForAgents = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { search = "" } = req.query;

    const user = await prisma.customUser.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return res.respond(404, "User not found");
    }

    const searchFilter = search
        ? {
            OR: [
                { name: { contains: search, mode: "insensitive" } },
                { address: { contains: search, mode: "insensitive" } }
            ]
        }
        : {};

    const partners = await prisma.partner.findMany({
        where: {
            isActive: true,
            ...searchFilter
        },
        select: {
            id: true,
            name: true,
            code: true,
            address: true
        },
        orderBy: { name: "asc" }
    });

    res.respond(200, "Partners fetched successfully", partners);
});

module.exports = {
    createPartner,
    getAllPartners,
    updatePartner,
    deletePartner,
    getPartnersForAgents
};