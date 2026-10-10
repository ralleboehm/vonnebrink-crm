const express = require("express");

const router = express.Router();

const documentController = require("../../controllers/portal/document.controller");
const { requirePortalAuth } = require("../../middleware/auth/portalAuth.middleware");

// ----------------------------------------------------
// Meine Dokumente (unter /portal/documents)
// ----------------------------------------------------
//
// Welche Dokumente ein Kontakt sieht, entscheidet die Freigabe im CRM
// (alle Portal-Nutzer der Firma, Merkmale oder einzelne Personen).

router.get("/", requirePortalAuth, documentController.index);
router.get("/:id/download", requirePortalAuth, documentController.download);

module.exports = router;
