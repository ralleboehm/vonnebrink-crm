const express = require("express");

const router = express.Router();

// ----------------------------------------------------
// Health
// ----------------------------------------------------

router.use("/api/v1/health", require("./health.routes"));

// ----------------------------------------------------
// CRM
// ----------------------------------------------------

router.use("/crm", require("./crm"));

// ----------------------------------------------------
// Kundenportal
// ----------------------------------------------------

router.use("/portal", require("./portal"));

module.exports = router;