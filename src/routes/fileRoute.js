// src/routes/fileRoute.js
const express = require("express");
const router = express.Router();
const validateToken = require("../../middleware/validateJwtToken");
const {
  getPresignedUrl,
  getPresignedUrls,
  deleteFile,
} = require("../controllers/fileController");

router.get("/presigned-url", validateToken, getPresignedUrl);

router.post("/presigned-urls", validateToken, getPresignedUrls);

router.delete("/delete", validateToken, deleteFile);

module.exports = router;