const createS3Uploader = require("./createS3Uploader");

const createUploadMiddleware = (entity, fileFields) => {
  return (req, res, next) => {
    const uploader = createS3Uploader(entity, fileFields);

    const fields = Object.keys(fileFields).map((key) => ({
      name: key,
      maxCount: 1,
    }));

    uploader.fields(fields)(req, res, function (err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      if (req.files) {
        Object.keys(req.files).forEach((fieldName) => {
          req.files[fieldName].forEach((file) => {
            file.path = `/${file.key}`;
          });
        });
      }

      next();
    });
  };
};

module.exports = createUploadMiddleware;