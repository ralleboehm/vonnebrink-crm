const express = require("express");

const router = express.Router();

// CRM
router.use("/crm", require("./crm"));

// Kundenportal
router.use("/portal", require("./portal"));

module.exports = router;