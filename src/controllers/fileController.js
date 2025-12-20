const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { s3Client, BUCKET_NAME } = require("../../utils/s3Client");
const { asyncHandler } = require("../../utils/asyncHandler");

const getPresignedUrl = asyncHandler(async (req, res) => {
  const { path: filePath } = req.query;

  if (!filePath) {
    return res.respond(400, "File path is required");
  }

  const s3Key = filePath.startsWith("/") ? filePath.substring(1) : filePath;

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    res.respond(200, "Presigned URL generated successfully", { url });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    res.respond(500, "Failed to generate presigned URL", { error: error.message });
  }
});

const getPresignedUrls = asyncHandler(async (req, res) => {
  const { paths } = req.body;

  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return res.respond(400, "Array of file paths is required");
  }

  try {
    const urls = {};

    await Promise.all(
      paths.map(async (filePath) => {
        if (!filePath) return;

        const s3Key = filePath.startsWith("/") ? filePath.substring(1) : filePath;

        try {
          const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
          });

          const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
          urls[filePath] = url;
        } catch (error) {
          console.error(`Error generating URL for ${filePath}:`, error);
          urls[filePath] = null;
        }
      })
    );

    res.respond(200, "Presigned URLs generated successfully", { urls });
  } catch (error) {
    console.error("Error generating presigned URLs:", error);
    res.respond(500, "Failed to generate presigned URLs", { error: error.message });
  }
});

const deleteFile = asyncHandler(async (req, res) => {
  const { path: filePath } = req.body;

  if (!filePath) {
    return res.respond(400, "File path is required");
  }

  const s3Key = filePath.startsWith("/") ? filePath.substring(1) : filePath;

  try {
    const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
    
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });

    await s3Client.send(command);

    res.respond(200, "File deleted successfully");
  } catch (error) {
    console.error("Error deleting file:", error);
    res.respond(500, "Failed to delete file", { error: error.message });
  }
});

module.exports = {
  getPresignedUrl,
  getPresignedUrls,
  deleteFile,
};