const express = require("express");

const router = express.Router();

// ----------------------------------------------------
// Authentifizierung
// ----------------------------------------------------

router.use("/", require("./auth.routes"));

// ----------------------------------------------------
// Dashboard
// ----------------------------------------------------

router.use("/", require("./dashboard.routes"));

// ----------------------------------------------------
// Tickets
// ----------------------------------------------------

router.use("/tickets", require("./ticket.routes"));

// ----------------------------------------------------
// Dokumente
// ----------------------------------------------------

router.use("/documents", require("./document.routes"));

// ----------------------------------------------------
// Profil
// ----------------------------------------------------

router.use("/profile", require("./profile.routes"));

module.exports = router;