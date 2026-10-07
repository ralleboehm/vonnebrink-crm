const express = require("express");

const router = express.Router();

const importController = require("../../controllers/crm/import.controller");

const upload = require("../../config/importUpload");

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

router.get(

    "/",

    importController.index

);

// ----------------------------------------------------
// Firmen importieren
// ----------------------------------------------------

router.get(

    "/companies",

    importController.companyImportForm

);

router.post(

    "/companies",

    upload.single("csvFile"),

    importController.companyImport

);

module.exports = router;