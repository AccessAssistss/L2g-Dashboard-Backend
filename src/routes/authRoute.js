const express = require("express");
const router = express.Router();
const validateToken = require("../../middleware/validateJwtToken");
const {
    registerAgent,
    login,
    logout,
    getCurrentUser,
    refreshAccessToken,
    updateProfile
} = require("../controllers/authController");

router.post("/registerAgent", registerAgent);
router.post("/login", login);
router.post("/refreshAccessToken", refreshAccessToken);
router.post("/logout", validateToken, logout);
router.get("/getCurrentUser", validateToken, getCurrentUser);
router.put("/updateProfile", validateToken, updateProfile);

module.exports = router;