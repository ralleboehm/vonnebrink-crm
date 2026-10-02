const express = require("express");

const router = express.Router();

const companyController = require("../controllers/company.controller");

// Alle Firmen anzeigen
router.get("/", companyController.index);

// Formular für neue Firma
router.get("/new", companyController.create);

// Neue Firma speichern
router.post("/", companyController.store);

// Einzelne Firma anzeigen
router.get("/:id", companyController.show);

// Formular zum Bearbeiten
router.get("/:id/edit", companyController.edit);

// Firma aktualisieren
router.post("/:id/update", companyController.update);

// Firma löschen (Soft Delete)
router.post("/:id/delete", companyController.destroy);

module.exports = router;