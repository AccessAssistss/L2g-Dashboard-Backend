const express = require("express");
const router = express.Router();
const validateToken = require("../../middleware/validateJwtToken");
const {
  getPresignedUrl,
  getPresignedUrls,
  deleteFile,
} = require("../controllers/fileController");

router.get("/presignedUrl", validateToken, getPresignedUrl);

router.post("/presignedUrls", validateToken, getPresignedUrls);

router.delete("/delete", validateToken, deleteFile);

module.exports = router;