const express = require("express");
const errorHandler = require("./utils/errorHandler");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const multer = require('multer');
const fs = require('fs');
const XLSX = require('xlsx');
const responseMiddleware = require("./utils/responseMiddleware");
const { startEMIScheduler } = require("./jobs/emiSchedulerJob");
const { bulkImportLoans } = require("./push-data");

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads', 'bulk');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for Excel file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'loan-import-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        const allowedExtensions = ['.xlsx', '.xls'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());

app.use(cors({
    origin: process.env.CORS_ORIGIN
}));

app.use(
  "/api/v1/webhook",
  express.raw({ type: "application/json" }),
  require("./src/routes/razorpayWebhookRoute")
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(responseMiddleware);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Welcome route
app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Welcome to the Education Loan Dashboard Backend!",
    });
});

// API Routes
app.use("/api/v1", require("./src/routes/routes"));
app.use("/push-data", upload.single('excelFile'), bulkImportLoans)

// Start automated EMI scheduler
startEMIScheduler();
console.log("e-NACH automation enabled");

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
}).on("error", (err) => {
    console.error("Server Error:", err);
    process.exit(1);
});