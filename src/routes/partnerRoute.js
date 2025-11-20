const express = require("express");
const router = express.Router();
const validateToken = require("../../middleware/validateJwtToken");
const {
    createPartner,
    getAllPartners,
    updatePartner,
    deletePartner,
} = require("../controllers/partnerController");

router.post("/createPartner", validateToken, createPartner);
router.get("/getAllPartners", validateToken, getAllPartners);
router.put("/updatePartner/:id", validateToken, updatePartner);
router.delete("/deletePartner/:id", validateToken, deletePartner);

module.exports = router;