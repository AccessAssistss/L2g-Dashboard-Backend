const multer = require("multer");
const multerS3 = require("multer-s3");
const path = require("path");
const { s3Client, BUCKET_NAME } = require("../utils/s3Client");

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "application/pdf"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function createS3Uploader(entity, fieldMap) {
  const storage = multerS3({
    s3: s3Client,
    bucket: BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    
    key: (req, file, cb) => {
      const subFolder = fieldMap[file.fieldname];
      
      if (!subFolder) {
        return cb(new Error(`Invalid field name: ${file.fieldname}`), null);
      }

      const ext = path.extname(file.originalname);
      const timestamp = Date.now();
      const randomString = Math.round(Math.random() * 1e9);
      const safeName = `${file.fieldname}-${timestamp}-${randomString}${ext}`;
      
      const s3Key = `uploads/${entity}/${subFolder}/${safeName}`;
      
      cb(null, s3Key);
    },

    metadata: (req, file, cb) => {
      cb(null, {
        fieldName: file.fieldname,
        originalName: file.originalname,
      });
    },
  });

  const fileFilter = (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only PNG, JPEG, PDF allowed.`));
    }
  };

  return multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter,
  });
}

module.exports = createS3Uploader;