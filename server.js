const express = require("express");
const errorHandler = require("./utils/errorHandler");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const responseMiddleware = require("./utils/responseMiddleware");
const { startEMIScheduler } = require("./jobs/emiSchedulerJob");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5003;

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
        message: "Welcome to the Loan2Grow Backend!",
    });
});

// API Routes
app.use("/api/v1", require("./src/routes/routes"));

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