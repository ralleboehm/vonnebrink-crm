const express = require("express");

const router = express.Router();

// Glocke in der Navigation (ungelesene Benachrichtigungen)
router.use(require("../../middleware/crm/notificationBell.middleware"));

// ----------------------------------------------------
// CRM Dashboard
// ----------------------------------------------------

router.use("/", require("./dashboard.routes"));

// ----------------------------------------------------
// Auth
// ----------------------------------------------------

router.use("/", require("./auth.routes"));

// ----------------------------------------------------
// Firmen
// ----------------------------------------------------

router.use("/companies", require("./company.routes"));

// ----------------------------------------------------
// Kontakte
// ----------------------------------------------------

router.use("/contacts", require("./contact.routes"));

// ----------------------------------------------------
// Benutzer
// ----------------------------------------------------

router.use("/users", require("./user.routes"));

// ----------------------------------------------------
// Tickets
// ----------------------------------------------------

router.use("/tickets", require("./ticket.routes"));

// ----------------------------------------------------
// Assets
// ----------------------------------------------------

router.use("/assets", require("./asset.routes"));

// ----------------------------------------------------
// Integrationen (Action1)
// ----------------------------------------------------

router.use("/integrations", require("./integration.routes"));

// ----------------------------------------------------
// Benachrichtigungen
// ----------------------------------------------------

router.use("/notifications", require("./notification.routes"));

// ----------------------------------------------------
// Globale Suche
// ----------------------------------------------------

router.use("/search", require("./search.routes"));

// ----------------------------------------------------
// Profil
// ----------------------------------------------------

router.use("/profile", require("./profile.routes"));

// ----------------------------------------------------
// Import & Export
// ----------------------------------------------------

router.use("/import", require("./import.routes"));

module.exports = router;