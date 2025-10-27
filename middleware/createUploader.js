const multer = require("multer");
const path = require("path");
const fs = require("fs");

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "application/pdf"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const BASE_UPLOADS_DIR = path.join(__dirname, "../uploads");

function ensureUploadPath(folderPath) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
}

function createUploader(entity, fieldMap) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const subFolder = fieldMap[file.fieldname];
      if (!subFolder) {
        return cb(new Error("Invalid fieldname"), null);
      }

      const uploadPath = path.join(BASE_UPLOADS_DIR, entity, subFolder);
      ensureUploadPath(uploadPath);
      cb(null, uploadPath);
    },

    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const safeName = file.fieldname + "-" + Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
      cb(null, safeName);
    },
  });

  const fileFilter = (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PNG, JPEG, PDF allowed."));
    }
  };

  return multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter,
  });
}

module.exports = createUploader;