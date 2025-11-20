const express = require("express");
const router = express.Router();
const validateToken = require("../../middleware/validateJwtToken");
const {
    createLoanScheme,
    getAllLoanSchemes,
    updateLoanScheme,
    deleteLoanScheme,
    getSchemesByPartnerAndCourse,
} = require("../controllers/loanSchemeController");

router.post("/createLoanScheme", validateToken, createLoanScheme);
router.get("/getAllLoanSchemes", validateToken, getAllLoanSchemes);
router.put("/updateLoanScheme/:id", validateToken, updateLoanScheme);
router.delete("/deleteLoanScheme/:id", validateToken, deleteLoanScheme);
router.get("/getSchemesByPartnerAndCourse/:id", validateToken, getSchemesByPartnerAndCourse);

module.exports = router;