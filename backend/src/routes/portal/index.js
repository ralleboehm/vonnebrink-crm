const express = require("express");

const router = express.Router();

// Login
router.use("/", require("./auth.routes"));

// Später:
//
// router.use("/", require("./dashboard.routes"));
// router.use("/tickets", require("./ticket.routes"));
// router.use("/profile", require("./profile.routes"));

module.exports = router;