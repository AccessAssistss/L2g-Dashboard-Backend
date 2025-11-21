const express = require("express");
const router = express.Router();
const validateToken = require("../../middleware/validateJwtToken");
const {
    createPartner,
    getAllPartners,
    updatePartner,
    deletePartner,
    getPartnersForAgents,
} = require("../controllers/partnerController");

router.post("/createPartner", validateToken, createPartner);
router.get("/getAllPartners", getAllPartners);
router.put("/updatePartner/:id", validateToken, updatePartner);
router.delete("/deletePartner/:id", validateToken, deletePartner);
router.get("/getPartnersForAgents", validateToken, getPartnersForAgents);

module.exports = router;