const express = require("express");

const router = express.Router();

const importController = require("../../controllers/crm/import.controller");

const {
    requireAuth,
    requireRole
} = require("../../middleware/auth/crmAuth.middleware");

// ----------------------------------------------------
// Alle Routen nur für Administratoren
// ----------------------------------------------------

router.use(

    requireAuth,

    requireRole("admin")

);

// ----------------------------------------------------
// Startseite
// ----------------------------------------------------

router.get("/", importController.index);

// ----------------------------------------------------
// Export (muss vor den Import-Routen stehen)
// ----------------------------------------------------

router.get(
    "/export/:entity",
    importController.withExportDefinition,
    importController.exportForm
);

router.get(
    "/export/:entity/download",
    importController.withExportDefinition,
    importController.exportDownload
);

// ----------------------------------------------------
// Import-Assistent
//   :entity = companies | contacts
// ----------------------------------------------------

// 1. Datei hochladen
router.get(
    "/:entity",
    importController.withEntity,
    importController.uploadForm
);

router.post(
    "/:entity",
    importController.withEntity,
    importController.upload
);

// 2. Spalten zuordnen
router.get(
    "/:entity/map",
    importController.withEntity,
    importController.mapForm
);

router.post(
    "/:entity/map",
    importController.withEntity,
    importController.mapSubmit
);

// 3. Prüfen
router.get(
    "/:entity/review",
    importController.withEntity,
    importController.review
);

// 4. Importieren
router.post(
    "/:entity/commit",
    importController.withEntity,
    importController.commit
);

// Abbrechen
router.post(
    "/:entity/cancel",
    importController.withEntity,
    importController.cancel
);

// Ergebnis
router.get(
    "/:entity/result",
    importController.withEntity,
    importController.result
);

router.get(
    "/:entity/result/errors.csv",
    importController.withEntity,
    importController.errorReport
);

module.exports = router;
