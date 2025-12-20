const express = require("express");
const router = express.Router();
const validateToken = require("../../middleware/validateJwtToken");
const {
    createCourse,
    getAllCourses,
    updateCourse,
    deleteCourse,
    getCoursesByPartnerForAgents,
} = require("../controllers/courseController");

router.post("/createCourse", validateToken, createCourse);
router.get("/getAllCourses", validateToken, getAllCourses);
router.put("/updateCourse/:id", validateToken, updateCourse);
router.delete("/deleteCourse/:id", validateToken, deleteCourse);
router.get("/getCoursesByPartnerForAgents/:partnerId", validateToken, getCoursesByPartnerForAgents);

module.exports = router;