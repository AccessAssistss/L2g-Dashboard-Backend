const { PrismaClient } = require("@prisma/client");
const { asyncHandler } = require("../../utils/asyncHandler");
const {
    hashPassword,
    verifyPassword,
    generateAccessToken,
    generateRefreshToken,
} = require("../../utils/authUtils");

const prisma = new PrismaClient();

// ###############---------------Generate Access And Refresh Token---------------###############
const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await prisma.customUser.findFirst({
            where: { id: userId },
            include: { admin: true }
        });

        if (!user) {
            throw new Error("User not found");
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        await prisma.customUser.update({
            where: { id: userId },
            data: {
                accessToken,
                refreshToken
            },
        });

        return { accessToken, refreshToken };
    } catch (error) {
        console.error("Error generating tokens:", error);
        throw new Error("Something went wrong while generating tokens");
    }
};

// ###############---------------Register Admin---------------###############
const registerAdmin = asyncHandler(async (req, res) => {
    const {
        email,
        name,
        mobile,
        password,
    } = req.body;

    if (!email || !name || !mobile || !password) {
        return res.respond(400, "Email, name, mobile, and password are required");
    }

    const existingUser = await prisma.customUser.findFirst({
        where: {
            OR: [
                { email },
                { mobile }
            ]
        }
    });

    if (existingUser) {
        return res.respond(400, "User with this email or mobile already exists");
    }

    const hashedPassword = await hashPassword(password);

    const result = await prisma.$transaction(async (tx) => {
        const customUser = await tx.customUser.create({
            data: {
                email,
                name,
                mobile,
                password: hashedPassword,
                userType: "ADMIN"
            }
        });

        const admin = await tx.admin.create({
            data: {
                customUserId: customUser.id,
                name
            }
        });

        return { customUser, admin };
    });

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(result.customUser.id);

    const { password: _, ...userWithoutPassword } = result.customUser;

    res.respond(201, "Admin registered successfully", {
        admin: result.admin,
        accessToken,
        refreshToken
    });
});

// ###############---------------Login Admin---------------###############
const loginAdmin = asyncHandler(async (req, res) => {
    const { email, mobile, password } = req.body;

    if (!password) {
        return res.respond(400, "Password is required");
    }

    if (!email && !mobile) {
        return res.respond(400, "Email or mobile is required");
    }

    const user = await prisma.customUser.findFirst({
        where: {
            OR: [
                { email: email || undefined },
                { mobile: mobile || undefined }
            ]
        },
        include: {
            admin: true
        }
    });

    if (!user) {
        return res.respond(401, "Invalid credentials");
    }

    const isPasswordValid = await verifyPassword(password, user.password);

    if (!isPasswordValid) {
        return res.respond(401, "Invalid credentials");
    }

    if (user.userType === "ADMIN" && user.admin && !user.admin.isActive) {
        return res.respond(403, "Your account has been deactivated. Please contact admin.");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user.id);

    const { password: _, ...userWithoutPassword } = user;

    res.respond(200, "Login successful", {
        user: userWithoutPassword,
        accessToken,
        refreshToken
    });
});

module.exports = {
    registerAdmin,
    loginAdmin
};