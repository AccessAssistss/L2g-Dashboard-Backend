const { S3Client } = require("@aws-sdk/client-s3");

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  throw new Error("AWS credentials not found in environment variables");
}

if (!process.env.AWS_REGION || !process.env.AWS_S3_BUCKET_NAME) {
  throw new Error("AWS region or bucket name not found in environment variables");
}

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

module.exports = {
  s3Client,
  BUCKET_NAME,
};