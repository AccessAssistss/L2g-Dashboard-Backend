const createUploader = require("./createUploader");

const createUploadMiddleware = (entity, fileFields) => {
  return (req, res, next) => {
    const uploader = createUploader(entity, fileFields);

    const fields = Object.keys(fileFields).map((key) => ({
      name: key,
      maxCount: 1,
    }));

    uploader.fields(fields)(req, res, function (err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  };
};

module.exports = createUploadMiddleware;
