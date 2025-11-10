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
            include: { agent: true }
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

// ###############---------------Register Agent---------------###############
const registerAgent = asyncHandler(async (req, res) => {
    const {
        email,
        name,
        mobile,
        password,
        designation,
        department
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
                userType: "AGENT"
            }
        });

        const agent = await tx.agent.create({
            data: {
                customUserId: customUser.id,
                designation,
                department
            }
        });

        return { customUser, agent };
    });

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(result.customUser.id);

    const { password: _, ...userWithoutPassword } = result.customUser;

    res.respond(201, "Agent registered successfully", {
        agent: result.agent,
        accessToken,
        refreshToken
    });
});

// ###############---------------Login---------------###############
const login = asyncHandler(async (req, res) => {
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
            agent: true
        }
    });

    if (!user) {
        return res.respond(401, "Invalid credentials");
    }

    const isPasswordValid = await verifyPassword(password, user.password);

    if (!isPasswordValid) {
        return res.respond(401, "Invalid credentials");
    }

    if (user.userType === "AGENT" && user.agent && !user.agent.isActive) {
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

// ###############---------------Logout---------------###############
const logout = asyncHandler(async (req, res) => {
    const userId = req.user;

    await prisma.customUser.update({
        where: { id: userId },
        data: {
            accessToken: null,
            refreshToken: null
        }
    });

    res.respond(200, "Logout successful");
});

// ###############---------------Get Current User---------------###############
const getCurrentUser = asyncHandler(async (req, res) => {
    const userId = req.user;

    const user = await prisma.customUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      mobile: true,
      userType: true,
      createdAt: true,
      updatedAt: true,
      agent: true
    },
  });

    if (!user) {
        return res.respond(404, "User not found");
    }

    res.respond(200, "Current user fetched successfully", user);
});

// ###############---------------Refresh Access Token---------------###############
const refreshAccessToken = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.respond(400, "Refresh token is required");
    }

    const user = await prisma.customUser.findFirst({
        where: { refreshToken }
    });

    if (!user) {
        return res.respond(401, "Invalid refresh token");
    }

    try {
        const jwt = require("jsonwebtoken");
        jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

        const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefreshTokens(user.id);

        res.respond(200, "Access token refreshed successfully", {
            accessToken,
            refreshToken: newRefreshToken
        });
    } catch (error) {
        return res.respond(401, "Invalid or expired refresh token");
    }
});

// ###############---------------Update Profile---------------###############
const updateProfile = asyncHandler(async (req, res) => {
    const userId = req.user;
    const { name, designation, department } = req.body;

    const user = await prisma.customUser.findUnique({
        where: { id: userId },
        include: { agent: true }
    });

    if (!user) {
        return res.respond(404, "User not found");
    }

    const result = await prisma.$transaction(async (tx) => {
        const updatedUser = await tx.customUser.update({
            where: { id: userId },
            data: {
                name: name || user.name,
            }
        });

        let updatedAgent = null;
        if (user.agent && (designation || department)) {
            updatedAgent = await tx.agent.update({
                where: { id: user.agent.id },
                data: {
                    designation: designation || user.agent.designation,
                    department: department || user.agent.department
                }
            });
        }

        return { updatedUser, updatedAgent };
    });

    const { password: _, ...userWithoutPassword } = result.updatedUser;

    res.respond(200, "Profile updated successfully", {
        user: userWithoutPassword,
        agent: result.updatedAgent
    });
});

module.exports = {
    registerAgent,
    login,
    logout,
    getCurrentUser,
    refreshAccessToken,
    updateProfile
};