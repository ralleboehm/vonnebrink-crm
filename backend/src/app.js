const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Health Check
app.get("/api/v1/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        version: "1.0.0",
        timestamp: new Date().toISOString()
    });
});

module.exports = app;
