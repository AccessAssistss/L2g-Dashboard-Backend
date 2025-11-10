const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ###############---------------Generate Random Password---------------###############
const generateRandomPassword = (length = 8) => {
  try {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return password;
  } catch (error) {
    throw error;
  }
};

// ###############---------------Hash Password Function---------------###############
const hashPassword = async (password) => {
  try {
    const hashed = await bcrypt.hash(password, 10);
    return hashed;
  } catch (error) {
    throw error;
  }
};

// ###############---------------Verify Password Function---------------###############
const verifyPassword = async (password, hashedPassword) => {
  try {
    const isMatch = await bcrypt.compare(password, hashedPassword);
    return isMatch;
  } catch (error) {
    throw error;
  }
};

// ###############---------------Generate Access Token Function---------------###############
const generateAccessToken = (user) => {
  try {
    const token = jwt.sign({ id: user.id }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    });
    return token;
  } catch (error) {
    throw error;
  }
};

// ###############---------------Generate Refresh Token Function---------------###############
const generateRefreshToken = (user) => {
  try {
    const token = jwt.sign({ id: user.id }, process.env.REFRESH_TOKEN_SECRET, {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    });
    return token;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  generateRandomPassword,
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
};
